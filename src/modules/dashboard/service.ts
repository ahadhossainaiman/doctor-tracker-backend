import { Doctor } from '../doctors/model.js';
import { Patient } from '../patients/model.js';
import { cacheGet, cacheSet } from '../../utils/cache.js';
import type { ConditionsQuery, PatientsPerDoctorQuery, TimeseriesQuery } from './schema.js';

export type ChartSeries = {
  labels: string[];
  values: number[];
};

type BucketUnit = 'day' | 'week' | 'month';
type RangeKey = TimeseriesQuery['range'];

export type DashboardSummary = {
  totalDoctors: number;
  totalPatients: number;
  patientsThisMonth: number;
  averagePatientsPerDoctor: number;
  recentDoctors: Array<{
    id: string;
    name: string;
    specialization: string;
    hospital: string;
    createdAt: string;
  }>;
  recentPatients: Array<{
    id: string;
    name: string;
    condition: string;
    registeredAt: string;
    doctor: string;
    doctorName?: string;
  }>;
};

function defaultInterval(range: RangeKey): BucketUnit {
  if (range === '90d') return 'week';
  if (range === '12m') return 'month';
  return 'day';
}

function rangeWindow(range: RangeKey, now: Date): { from: Date; to: Date } {
  const to = now;
  const from = new Date(now.getTime());
  if (range === '7d') from.setUTCDate(from.getUTCDate() - 7);
  else if (range === '30d') from.setUTCDate(from.getUTCDate() - 30);
  else if (range === '90d') from.setUTCDate(from.getUTCDate() - 90);
  else from.setUTCMonth(from.getUTCMonth() - 12);
  return { from, to };
}

function startOfBucket(date: Date, unit: BucketUnit): Date {
  if (unit === 'month') {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }
  if (unit === 'week') {
    const day = date.getUTCDay();
    const distance = day === 0 ? 6 : day - 1;
    const monday = new Date(date.getTime());
    monday.setUTCDate(monday.getUTCDate() - distance);
    return new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()));
  }
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function shiftBucket(date: Date, unit: BucketUnit): void {
  if (unit === 'month') date.setUTCMonth(date.getUTCMonth() + 1);
  else if (unit === 'week') date.setUTCDate(date.getUTCDate() + 7);
  else date.setUTCDate(date.getUTCDate() + 1);
}

function bucketLabel(date: Date, unit: BucketUnit): string {
  const iso = date.toISOString();
  return unit === 'month' ? iso.slice(0, 7) : iso.slice(0, 10);
}

function fillBuckets(
  from: Date,
  to: Date,
  unit: BucketUnit,
  rows: Array<{ date: Date; count: number }>,
): ChartSeries {
  const counts = new Map(
    rows.map((row) => [bucketLabel(startOfBucket(row.date, unit), unit), row.count]),
  );
  const labels: string[] = [];
  const values: number[] = [];
  const cursor = startOfBucket(from, unit);
  const end = startOfBucket(to, unit);
  while (cursor.getTime() <= end.getTime()) {
    const label = bucketLabel(cursor, unit);
    labels.push(label);
    values.push(counts.get(label) ?? 0);
    shiftBucket(cursor, unit);
  }
  return { labels, values };
}

export async function getSummary(): Promise<DashboardSummary> {
  const cached = cacheGet<DashboardSummary>('dashboard:summary');
  if (cached) return cached;

  const monthStart = new Date();
  const start = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1));

  const [totalDoctors, totalPatients, patientsThisMonth, recentDoctors, recentPatients] =
    await Promise.all([
      Doctor.countDocuments().exec(),
      Patient.countDocuments().exec(),
      Patient.countDocuments({ registeredAt: { $gte: start } }).exec(),
      Doctor.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('name specialization hospital createdAt')
        .lean()
        .exec(),
      Patient.find()
        .sort({ registeredAt: -1 })
        .limit(5)
        .select('name condition registeredAt doctor')
        .populate('doctor', 'name')
        .lean()
        .exec(),
    ]);

  const summary: DashboardSummary = {
    totalDoctors,
    totalPatients,
    patientsThisMonth,
    averagePatientsPerDoctor:
      totalDoctors === 0 ? 0 : Math.round((totalPatients / totalDoctors) * 100) / 100,
    recentDoctors: recentDoctors.map((doctor) => ({
      id: String(doctor._id),
      name: doctor.name,
      specialization: doctor.specialization,
      hospital: doctor.hospital,
      createdAt: doctor.createdAt.toISOString(),
    })),
    recentPatients: recentPatients.map((patient) => {
      const doctor = patient.doctor;
      const doctorId =
        typeof doctor === 'object' && doctor !== null && '_id' in doctor
          ? String(doctor._id)
          : String(doctor);
      const doctorName =
        typeof doctor === 'object' &&
        doctor !== null &&
        'name' in doctor &&
        typeof doctor.name === 'string'
          ? doctor.name
          : undefined;
      return {
        id: String(patient._id),
        name: patient.name,
        condition: patient.condition,
        registeredAt: patient.registeredAt.toISOString(),
        doctor: doctorId,
        doctorName,
      };
    }),
  };

  cacheSet('dashboard:summary', summary);
  return summary;
}

/** Sorted denormalized patientCount. Uses `{patientCount:-1}`, not a $lookup. */
export async function patientsPerDoctor(query: PatientsPerDoctorQuery): Promise<ChartSeries> {
  const key = `dashboard:patients-per-doctor:${query.limit}`;
  const cached = cacheGet<ChartSeries>(key);
  if (cached) return cached;

  const doctors = await Doctor.find({ patientCount: { $gt: 0 } })
    .sort({ patientCount: -1 })
    .limit(query.limit)
    .select('name patientCount')
    .lean()
    .exec();

  const series = {
    labels: doctors.map((doctor) => doctor.name),
    values: doctors.map((doctor) => doctor.patientCount),
  };
  cacheSet(key, series);
  return series;
}

export async function timeseries(query: TimeseriesQuery): Promise<ChartSeries> {
  const interval = query.interval ?? defaultInterval(query.range);
  const key = `dashboard:timeseries:${query.range}:${interval}`;
  const cached = cacheGet<ChartSeries>(key);
  if (cached) return cached;

  const now = new Date();
  const { from, to } = rangeWindow(query.range, now);
  const rows = await Patient.aggregate<{ _id: Date; count: number }>([
    { $match: { registeredAt: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: {
          $dateTrunc: {
            date: '$registeredAt',
            unit: interval,
            timezone: 'UTC',
            ...(interval === 'week' ? { startOfWeek: 'monday' } : {}),
          },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]).exec();

  const series = fillBuckets(
    from,
    to,
    interval,
    rows.map((row) => ({ date: new Date(row._id), count: row.count })),
  );
  cacheSet(key, series);
  return series;
}

export async function conditions(query: ConditionsQuery): Promise<ChartSeries> {
  const key = `dashboard:conditions:${query.limit}`;
  const cached = cacheGet<ChartSeries>(key);
  if (cached) return cached;

  const rows = await Patient.aggregate<{ _id: string; count: number }>([
    { $match: { condition: { $gte: '' } } },
    { $group: { _id: '$condition', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
  ]).exec();

  const top = rows.slice(0, query.limit);
  const rest = rows.slice(query.limit);
  const labels = top.map((row) => row._id);
  const values = top.map((row) => row.count);
  if (rest.length > 0) {
    labels.push('Other');
    values.push(rest.reduce((sum, row) => sum + row.count, 0));
  }

  const series = { labels, values };
  cacheSet(key, series);
  return series;
}

export async function specializations(): Promise<ChartSeries> {
  const key = 'dashboard:specializations';
  const cached = cacheGet<ChartSeries>(key);
  if (cached) return cached;

  const rows = await Doctor.aggregate<{ _id: string; count: number }>([
    { $match: { specialization: { $gte: '' } } },
    { $group: { _id: '$specialization', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: 50 },
  ]).exec();

  const series = {
    labels: rows.map((row) => row._id),
    values: rows.map((row) => row.count),
  };
  cacheSet(key, series);
  return series;
}
