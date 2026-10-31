import { Types, type ClientSession } from 'mongoose';
import { createdAtRange } from '../../utils/dateRange.js';
import { escapeRegex } from '../../utils/escapeRegex.js';
import { ApiError } from '../../utils/ApiError.js';
import { invalidateReadCaches } from '../../utils/cache.js';
import { toPaginationMeta, type PaginationMeta } from '../../utils/response.js';
import { runWithTransaction, sessionOptions } from '../../utils/transactions.js';
import { Doctor } from '../doctors/model.js';
import { Patient, type PatientDocument, type PatientGender } from './model.js';
import type { CreatePatientInput, PatientListQuery, UpdatePatientInput } from './schema.js';

const LIST_FIELDS =
  'name age gender phone email condition registeredAt notes doctor createdAt updatedAt';

export type PatientDto = {
  id: string;
  name: string;
  age: number;
  gender: PatientGender;
  phone: string;
  email?: string;
  condition: string;
  registeredAt: string;
  notes?: string;
  doctor: string;
  doctorName?: string;
  createdAt: string;
  updatedAt: string;
};

type DoctorRef = Types.ObjectId | { _id: Types.ObjectId; name?: string };

type PatientRecord = Omit<PatientDocument, 'doctor'> & {
  _id: unknown;
  doctor: DoctorRef;
};

function isPhoneQuery(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 3 && /^[\d+\-()\s]+$/.test(value);
}

function toPatientDto(patient: PatientRecord): PatientDto {
  const doctor = patient.doctor;
  const doctorId =
    typeof doctor === 'object' && doctor !== null && '_id' in doctor
      ? String(doctor._id)
      : String(doctor);
  const doctorName =
    typeof doctor === 'object' && doctor !== null && 'name' in doctor ? doctor.name : undefined;

  return {
    id: String(patient._id),
    name: patient.name,
    age: patient.age,
    gender: patient.gender,
    phone: patient.phone,
    email: patient.email,
    condition: patient.condition,
    registeredAt: patient.registeredAt.toISOString(),
    notes: patient.notes,
    doctor: doctorId,
    doctorName,
    createdAt: patient.createdAt.toISOString(),
    updatedAt: patient.updatedAt.toISOString(),
  };
}

/**
 * Name and condition use the text index.
 * A phone-shaped query uses an anchored prefix on the phone index instead.
 */
type PatientFilter = {
  doctor?: string;
  condition?: string;
  gender?: PatientDocument['gender'];
  registeredAt?: { $gte?: Date; $lte?: Date };
  phone?: { $regex: string };
  $text?: { $search: string };
};

export function buildPatientFilter(
  query: Pick<PatientListQuery, 'q' | 'condition' | 'doctor' | 'gender' | 'from' | 'to'>,
  doctorId?: string,
): PatientFilter {
  const filter: PatientFilter = {};
  if (doctorId || query.doctor) {
    filter.doctor = doctorId ?? query.doctor;
  }
  if (query.condition) {
    filter.condition = query.condition;
  }
  if (query.gender) {
    filter.gender = query.gender;
  }
  const registeredAt = createdAtRange(query.from, query.to);
  if (registeredAt) {
    filter.registeredAt = registeredAt;
  }
  if (query.q) {
    if (isPhoneQuery(query.q)) {
      filter.phone = { $regex: `^${escapeRegex(query.q)}` };
    } else {
      filter.$text = { $search: query.q };
    }
  }
  return filter;
}

function patientSort(query: Pick<PatientListQuery, 'sort' | 'order'>): Record<string, 1 | -1> {
  return { [query.sort]: query.order === 'asc' ? 1 : -1 };
}

async function requireDoctor(id: string, session: ClientSession | null): Promise<void> {
  const query = Doctor.exists({ _id: id });
  const found = await (session ? query.session(session) : query).exec();
  if (!found) {
    throw ApiError.notFound('Doctor not found');
  }
}

function patientPayload(input: CreatePatientInput, doctorId: string) {
  return {
    name: input.name,
    age: input.age,
    gender: input.gender,
    phone: input.phone,
    ...(input.email ? { email: input.email } : {}),
    condition: input.condition,
    registeredAt: input.registeredAt ? new Date(input.registeredAt) : new Date(),
    ...(input.notes ? { notes: input.notes } : {}),
    doctor: doctorId,
  };
}

export async function createForDoctor(
  doctorId: string,
  input: CreatePatientInput,
): Promise<PatientDto> {
  const patient = await runWithTransaction(async (session) => {
    await requireDoctor(doctorId, session);
    const options = sessionOptions(session);
    const docs = await Patient.create([patientPayload(input, doctorId)], options);
    const created = docs[0];
    if (!created) {
      throw ApiError.internal();
    }
    await Doctor.updateOne({ _id: doctorId }, { $inc: { patientCount: 1 } }, options).exec();
    return created.toObject();
  });
  invalidateReadCaches();
  return toPatientDto(patient);
}

export async function listPatients(
  query: PatientListQuery,
): Promise<{ items: PatientDto[]; meta: PaginationMeta }> {
  return listWithFilter(buildPatientFilter(query), query);
}

export async function listForDoctor(
  doctorId: string,
  query: { q?: string; page: number; limit: number },
): Promise<{ items: PatientDto[]; meta: PaginationMeta }> {
  await requireDoctor(doctorId, null);
  const listQuery: PatientListQuery = {
    q: query.q,
    page: query.page,
    limit: query.limit,
    sort: 'registeredAt',
    order: 'desc',
  };
  return listWithFilter(buildPatientFilter(listQuery, doctorId), listQuery);
}

async function listWithFilter(
  filter: PatientFilter,
  query: Pick<PatientListQuery, 'sort' | 'order' | 'page' | 'limit'>,
): Promise<{ items: PatientDto[]; meta: PaginationMeta }> {
  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    Patient.find(filter)
      .sort(patientSort(query))
      .skip(skip)
      .limit(query.limit)
      .select(LIST_FIELDS)
      .populate('doctor', 'name')
      .lean()
      .exec(),
    Patient.countDocuments(filter).exec(),
  ]);

  return {
    items: items.map((item) => toPatientDto(item)),
    meta: toPaginationMeta(query.page, query.limit, total),
  };
}

export async function getPatient(id: string): Promise<PatientDto> {
  const patient = await Patient.findById(id)
    .select(LIST_FIELDS)
    .populate('doctor', 'name')
    .lean()
    .exec();
  if (!patient) {
    throw ApiError.notFound('Patient not found');
  }
  return toPatientDto(patient);
}

export async function updatePatient(id: string, input: UpdatePatientInput): Promise<PatientDto> {
  const patient = await runWithTransaction(async (session) => {
    const options = sessionOptions(session);
    const query = Patient.findById(id);
    const current = await (session ? query.session(session) : query).exec();
    if (!current) {
      throw ApiError.notFound('Patient not found');
    }

    const previousDoctor = String(current.doctor);
    if (input.name !== undefined) current.name = input.name;
    if (input.age !== undefined) current.age = input.age;
    if (input.gender !== undefined) current.gender = input.gender;
    if (input.phone !== undefined) current.phone = input.phone;
    if (input.condition !== undefined) current.condition = input.condition;
    if (input.registeredAt !== undefined) current.registeredAt = new Date(input.registeredAt);
    if (input.notes !== undefined) current.notes = input.notes;
    if (input.email === '') {
      current.email = undefined;
    } else if (input.email) {
      current.email = input.email;
    }

    if (input.doctor && input.doctor !== previousDoctor) {
      await requireDoctor(input.doctor, session);
      current.doctor = new Types.ObjectId(input.doctor);
      await Doctor.updateOne(
        { _id: previousDoctor },
        { $inc: { patientCount: -1 } },
        options,
      ).exec();
      await Doctor.updateOne({ _id: input.doctor }, { $inc: { patientCount: 1 } }, options).exec();
    }

    await current.save(options);
    return current.toObject();
  });

  invalidateReadCaches();
  const populated = await Patient.findById(patient._id)
    .select(LIST_FIELDS)
    .populate('doctor', 'name')
    .lean()
    .exec();
  if (!populated) {
    throw ApiError.notFound('Patient not found');
  }
  return toPatientDto(populated);
}

export async function deletePatient(id: string, doctorId?: string): Promise<{ deleted: true }> {
  await runWithTransaction(async (session) => {
    const options = sessionOptions(session);
    const query = Patient.findById(id);
    const patient = await (session ? query.session(session) : query).exec();
    if (!patient || (doctorId && String(patient.doctor) !== doctorId)) {
      throw ApiError.notFound('Patient not found');
    }
    const ownerId = String(patient.doctor);
    await patient.deleteOne(options);
    await Doctor.updateOne({ _id: ownerId }, { $inc: { patientCount: -1 } }, options).exec();
  });
  invalidateReadCaches();
  return { deleted: true };
}

export async function recountPatientCounts(): Promise<{ doctors: number }> {
  const counts = await Patient.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { doctor: { $exists: true } } },
    { $group: { _id: '$doctor', count: { $sum: 1 } } },
  ]).exec();

  await Doctor.updateMany({}, { $set: { patientCount: 0 } }).exec();
  if (counts.length > 0) {
    await Doctor.bulkWrite(
      counts.map((row) => ({
        updateOne: {
          filter: { _id: row._id },
          update: { $set: { patientCount: row.count } },
        },
      })),
    );
  }
  invalidateReadCaches();
  return { doctors: counts.length };
}
