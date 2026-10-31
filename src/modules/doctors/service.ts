import { createdAtRange } from '../../utils/dateRange.js';
import { ApiError } from '../../utils/ApiError.js';
import { invalidateReadCaches } from '../../utils/cache.js';
import { toPaginationMeta, type PaginationMeta } from '../../utils/response.js';
import { runWithTransaction, sessionOptions } from '../../utils/transactions.js';
import { Patient } from '../patients/model.js';
import { Doctor, type DoctorDocument } from './model.js';
import type { CreateDoctorInput, DoctorListQuery, UpdateDoctorInput } from './schema.js';

const LIST_FIELDS = 'name specialization hospital phone email patientCount createdAt updatedAt';

export type DoctorDto = {
  id: string;
  name: string;
  specialization: string;
  hospital: string;
  phone: string;
  email: string;
  patientCount: number;
  createdAt: string;
  updatedAt: string;
};

type DoctorRecord = DoctorDocument & { _id: unknown };

function toDoctorDto(doctor: DoctorRecord): DoctorDto {
  return {
    id: String(doctor._id),
    name: doctor.name,
    specialization: doctor.specialization,
    hospital: doctor.hospital,
    phone: doctor.phone,
    email: doctor.email,
    patientCount: doctor.patientCount,
    createdAt: doctor.createdAt.toISOString(),
    updatedAt: doctor.updatedAt.toISOString(),
  };
}

type DoctorFilter = {
  specialization?: string;
  hospital?: string;
  createdAt?: { $gte?: Date; $lte?: Date };
  $text?: { $search: string };
};

/** Word search uses the text index on name, specialization, and hospital. */
export function buildDoctorFilter(query: DoctorListQuery): DoctorFilter {
  const filter: DoctorFilter = {};
  if (query.specialization) {
    filter.specialization = query.specialization;
  }
  if (query.hospital) {
    filter.hospital = query.hospital;
  }
  const createdAt = createdAtRange(query.from, query.to);
  if (createdAt) {
    filter.createdAt = createdAt;
  }
  if (query.q) {
    filter.$text = { $search: query.q };
  }
  return filter;
}

export function doctorSort(query: Pick<DoctorListQuery, 'sort' | 'order'>): Record<string, 1 | -1> {
  return { [query.sort]: query.order === 'asc' ? 1 : -1 };
}

export async function createDoctor(input: CreateDoctorInput): Promise<DoctorDto> {
  const doctor = await Doctor.create(input);
  invalidateReadCaches();
  return toDoctorDto(doctor);
}

export async function listDoctors(
  query: DoctorListQuery,
): Promise<{ items: DoctorDto[]; meta: PaginationMeta }> {
  const filter = buildDoctorFilter(query);
  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    Doctor.find(filter)
      .sort(doctorSort(query))
      .skip(skip)
      .limit(query.limit)
      .select(LIST_FIELDS)
      .lean()
      .exec(),
    Doctor.countDocuments(filter).exec(),
  ]);

  return {
    items: items.map((item) => toDoctorDto(item)),
    meta: toPaginationMeta(query.page, query.limit, total),
  };
}

export async function getDoctor(id: string): Promise<DoctorDto> {
  const doctor = await Doctor.findById(id).select(LIST_FIELDS).lean().exec();
  if (!doctor) {
    throw ApiError.notFound('Doctor not found');
  }
  return toDoctorDto(doctor);
}

export async function updateDoctor(id: string, input: UpdateDoctorInput): Promise<DoctorDto> {
  const doctor = await Doctor.findByIdAndUpdate(id, input, {
    new: true,
    runValidators: true,
  })
    .select(LIST_FIELDS)
    .lean()
    .exec();
  if (!doctor) {
    throw ApiError.notFound('Doctor not found');
  }
  invalidateReadCaches();
  return toDoctorDto(doctor);
}

/** DOC-9: block deletion while any patient still references the doctor. */
export async function deleteDoctor(id: string): Promise<{ deleted: true }> {
  await runWithTransaction(async (session) => {
    const options = sessionOptions(session);
    const patientQuery = Patient.countDocuments({ doctor: id });
    const remaining = await (options ? patientQuery.session(session) : patientQuery).exec();
    if (remaining > 0) {
      throw ApiError.conflict('Cannot delete a doctor who still has patients');
    }
    const deleted = await Doctor.deleteOne({ _id: id }, options).exec();
    if (deleted.deletedCount === 0) {
      throw ApiError.notFound('Doctor not found');
    }
  });
  invalidateReadCaches();
  return { deleted: true };
}
