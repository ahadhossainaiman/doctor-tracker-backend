import { connectDb, disconnectDb } from '../config/db.js';
import { Doctor } from '../modules/doctors/model.js';
import { Patient } from '../modules/patients/model.js';
import { collectPlan } from '../utils/explainPlan.js';
import { HOSPITALS, SPECIALIZATIONS, CONDITIONS } from './catalog.js';

type Explainable = {
  explain: (verbosity?: string) => Promise<unknown>;
};

async function report(name: string, query: Explainable): Promise<void> {
  const plan = collectPlan(await query.explain('queryPlanner'));
  const index = plan.indexes[0] ?? '(none)';
  console.log(`${name}: ${plan.stages.join(' -> ')} [${index}]`);
}

try {
  await connectDb();
  await Doctor.createIndexes();
  await Patient.createIndexes();
  const doctor = await Doctor.findOne().select('_id').lean().exec();
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  await report('doctors default createdAt', Doctor.find().sort({ createdAt: -1 }).limit(10));
  await report(
    'doctors specialization + createdAt',
    Doctor.find({ specialization: SPECIALIZATIONS[0] }).sort({ createdAt: -1 }).limit(10),
  );
  await report(
    'doctors hospital + createdAt',
    Doctor.find({ hospital: HOSPITALS[0] }).sort({ createdAt: -1 }).limit(10),
  );
  await report('doctors patientCount', Doctor.find().sort({ patientCount: -1 }).limit(10));
  await report('doctors name', Doctor.find().sort({ name: 1 }).limit(10));
  await report('doctors text', Doctor.find({ $text: { $search: 'Cardiology' } }).limit(10));
  await report(
    'patients by doctor + registeredAt',
    Patient.find(doctor ? { doctor: doctor._id } : {})
      .sort({ registeredAt: -1 })
      .limit(10),
  );
  await report(
    'patients condition + registeredAt',
    Patient.find({ condition: CONDITIONS[0] }).sort({ registeredAt: -1 }).limit(10),
  );
  await report(
    'patients registeredAt range',
    Patient.find({ registeredAt: { $gte: from } })
      .sort({ registeredAt: -1 })
      .limit(10),
  );
  await report(
    'patients gender + registeredAt',
    Patient.find({ gender: 'female' }).sort({ registeredAt: -1 }).limit(10),
  );
  await report('patients phone prefix', Patient.find({ phone: { $regex: '^017' } }).limit(10));
  await report('patients name sort', Patient.find().sort({ name: 1 }).limit(10));
  await disconnectDb();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
