import { cacheGet, cacheSet } from '../../utils/cache.js';
import { Doctor } from '../doctors/model.js';
import { Patient } from '../patients/model.js';

export type FilterOptions = {
  specializations: string[];
  hospitals: string[];
  conditions: string[];
};

export async function getFilters(): Promise<FilterOptions> {
  const cached = cacheGet<FilterOptions>('meta:filters');
  if (cached) return cached;

  const [specializations, hospitals, conditions] = await Promise.all([
    Doctor.distinct('specialization').exec(),
    Doctor.distinct('hospital').exec(),
    Patient.distinct('condition').exec(),
  ]);

  const filters = {
    specializations: specializations.filter((value) => value.length > 0).sort(),
    hospitals: hospitals.filter((value) => value.length > 0).sort(),
    conditions: conditions.filter((value) => value.length > 0).sort(),
  };
  cacheSet('meta:filters', filters);
  return filters;
}
