import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';

const ACCESS_SECRET = 'abcdefghijklmnopqrstuvwxyz123456';
const REFRESH_SECRET = 'zyxwvutsrqponmlkjihgfedcba654321';

process.env['NODE_ENV'] = 'test';
process.env['JWT_ACCESS_SECRET'] = ACCESS_SECRET;
process.env['JWT_REFRESH_SECRET'] = REFRESH_SECRET;
process.env['CLIENT_ORIGIN'] = 'http://localhost:3000';
process.env['COOKIE_SECURE'] = 'false';
process.env['COOKIE_SAMESITE'] = 'lax';
process.env['COOKIE_HTTPONLY'] = 'true';

const replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
process.env['MONGODB_URI'] = replset.getUri('doctor-tracker-test');

const { createApp } = await import('../src/app.js');
const { connectDb, disconnectDb } = await import('../src/config/db.js');
const { User } = await import('../src/modules/auth/model.js');
const { Doctor } = await import('../src/modules/doctors/model.js');
const { Patient } = await import('../src/modules/patients/model.js');
const { BCRYPT_COST } = await import('../src/modules/auth/service.js');
const { collectPlan } = await import('../src/utils/explainPlan.js');

await connectDb();
await Promise.all([User.createIndexes(), Doctor.createIndexes(), Patient.createIndexes()]);
await User.create({
  name: 'Admin',
  email: 'admin@doctortracker.local',
  passwordHash: await bcrypt.hash('ChangeMe123!', BCRYPT_COST),
  role: 'admin',
});

const app = createApp();

function cookieHeader(res: request.Response): string[] {
  const value = res.headers['set-cookie'];
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function login() {
  const agent = request.agent(app);
  const response = await agent.post('/api/v1/auth/login').send({
    email: 'admin@doctortracker.local',
    password: 'ChangeMe123!',
  });
  assert.equal(response.status, 200);
  return agent;
}

after(async () => {
  await disconnectDb();
  await replset.stop();
});

describe('auth', () => {
  it('returns 401 for protected routes without a cookie', async () => {
    const response = await request(app).get('/api/v1/doctors');
    assert.equal(response.status, 401);
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'UNAUTHORIZED');
  });

  it('logs in with httpOnly cookies and returns the current admin', async () => {
    const agent = request.agent(app);
    const response = await agent.post('/api/v1/auth/login').send({
      email: 'admin@doctortracker.local',
      password: 'ChangeMe123!',
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.data.email, 'admin@doctortracker.local');
    const cookies = cookieHeader(response);
    assert.ok(
      cookies.some((cookie) => cookie.startsWith('accessToken=') && /HttpOnly/i.test(cookie)),
    );
    assert.ok(
      cookies.some((cookie) => cookie.startsWith('refreshToken=') && /HttpOnly/i.test(cookie)),
    );

    const me = await agent.get('/api/v1/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.data.role, 'admin');
  });

  it('refreshes the access token and logout revokes the session', async () => {
    const agent = await login();
    const refreshed = await agent.post('/api/v1/auth/refresh');
    assert.equal(refreshed.status, 200);
    assert.ok(cookieHeader(refreshed).some((cookie) => cookie.startsWith('accessToken=')));

    const loggedOut = await agent.post('/api/v1/auth/logout');
    assert.equal(loggedOut.status, 200);
    const me = await agent.get('/api/v1/auth/me');
    assert.equal(me.status, 401);
  });

  it('returns 403 for a non-admin access token', async () => {
    const token = jwt.sign(
      { sub: '507f1f77bcf86cd799439011', role: 'viewer', type: 'access' },
      ACCESS_SECRET,
      { expiresIn: '15m', algorithm: 'HS256' },
    );
    const response = await request(app)
      .get('/api/v1/doctors')
      .set('Cookie', [`accessToken=${token}`]);
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'FORBIDDEN');
  });

  it('rate limits repeated failed logins', async () => {
    const email = 'locked@doctortracker.local';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app).post('/api/v1/auth/login').send({
        email,
        password: 'wrong-password',
      });
      assert.equal(response.status, 401);
    }
    const blocked = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'wrong-password',
    });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, 'TOO_MANY_REQUESTS');
  });
});

describe('doctors and patients', () => {
  it('filters doctors and keeps patientCount correct across create, reassign, and delete', async () => {
    const agent = await login();
    const cardio = await agent.post('/api/v1/doctors').send({
      name: 'Cara Heart',
      specialization: 'Cardiology',
      hospital: 'City General Hospital',
      phone: '01711111111',
      email: 'cara@example.com',
    });
    const neuro = await agent.post('/api/v1/doctors').send({
      name: 'Nia Nerve',
      specialization: 'Neurology',
      hospital: 'Lakeside Clinic',
      phone: '01722222222',
      email: 'nia@example.com',
    });
    assert.equal(cardio.status, 201);
    assert.equal(neuro.status, 201);

    const duplicate = await agent.post('/api/v1/doctors').send({
      name: 'Cara Heart',
      specialization: 'Cardiology',
      hospital: 'City General Hospital',
      phone: '01711111119',
      email: 'cara@example.com',
    });
    assert.equal(duplicate.status, 409);

    const listed = await agent.get('/api/v1/doctors').query({
      specialization: 'Cardiology',
      sort: 'createdAt',
      order: 'desc',
    });
    assert.equal(listed.status, 200);
    assert.ok(
      listed.body.data.every(
        (doctor: { specialization: string }) => doctor.specialization === 'Cardiology',
      ),
    );
    assert.ok(listed.body.meta.total >= 1);

    const byPrefix = await agent.get('/api/v1/doctors').query({ q: 'card' });
    assert.equal(byPrefix.status, 200);
    assert.ok(
      byPrefix.body.data.some(
        (doctor: { id: string }) => doctor.id === cardio.body.data.id,
      ),
    );

    const byWord = await agent.get('/api/v1/doctors').query({ q: 'Heart' });
    assert.equal(byWord.status, 200);
    assert.ok(
      byWord.body.data.some((doctor: { id: string }) => doctor.id === cardio.body.data.id),
    );

    const created = await agent.post(`/api/v1/doctors/${cardio.body.data.id}/patients`).send({
      name: 'Pat Example',
      age: 42,
      gender: 'female',
      phone: '01733333333',
      condition: 'Hypertension',
      registeredAt: new Date().toISOString(),
    });
    assert.equal(created.status, 201);

    const patientsByPrefix = await agent.get('/api/v1/patients').query({ q: 'hyp' });
    assert.equal(patientsByPrefix.status, 200);
    assert.ok(
      patientsByPrefix.body.data.some(
        (patient: { id: string }) => patient.id === created.body.data.id,
      ),
    );

    const afterCreate = await agent.get(`/api/v1/doctors/${cardio.body.data.id}`);
    assert.equal(afterCreate.body.data.patientCount, 1);

    const moved = await agent.patch(`/api/v1/patients/${created.body.data.id}`).send({
      doctor: neuro.body.data.id,
    });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.data.doctor, neuro.body.data.id);

    const cardioAfter = await agent.get(`/api/v1/doctors/${cardio.body.data.id}`);
    const neuroAfter = await agent.get(`/api/v1/doctors/${neuro.body.data.id}`);
    assert.equal(cardioAfter.body.data.patientCount, 0);
    assert.equal(neuroAfter.body.data.patientCount, 1);

    const removed = await agent.delete(`/api/v1/patients/${created.body.data.id}`);
    assert.equal(removed.status, 200);
    const neuroFinal = await agent.get(`/api/v1/doctors/${neuro.body.data.id}`);
    assert.equal(neuroFinal.body.data.patientCount, 0);

    const blocked = await agent.post(`/api/v1/doctors/${neuro.body.data.id}/patients`).send({
      name: 'Keep Me',
      age: 30,
      gender: 'male',
      phone: '01744444444',
      condition: 'Asthma',
    });
    assert.equal(blocked.status, 201);
    const blockedDelete = await agent.delete(`/api/v1/doctors/${neuro.body.data.id}`);
    assert.equal(blockedDelete.status, 409);
  });
});

describe('query plans', () => {
  it('uses indexes for list, filter, and search queries', async () => {
    await Doctor.create({
      name: 'Index Cardiology',
      specialization: 'Cardiology',
      hospital: 'City General Hospital',
      phone: '01755555555',
      email: 'index-cardio@example.com',
      patientCount: 3,
    });
    const doctor = await Doctor.findOne({ email: 'index-cardio@example.com' }).exec();
    assert.ok(doctor);
    await Patient.create({
      name: 'Index Patient',
      age: 50,
      gender: 'female',
      phone: '01766666666',
      condition: 'Hypertension',
      registeredAt: new Date(),
      doctor: doctor._id,
    });

    const queries: Array<[string, { explain: () => Promise<unknown> }]> = [
      ['doctors createdAt', Doctor.find().sort({ createdAt: -1 }).limit(10)],
      ['doctors specialization', Doctor.find({ specialization: 'Cardiology' }).sort({ createdAt: -1 }).limit(10)],
      ['doctors hospital', Doctor.find({ hospital: 'City General Hospital' }).sort({ createdAt: -1 }).limit(10)],
      ['doctors patientCount', Doctor.find().sort({ patientCount: -1 }).limit(10)],
      ['doctors name', Doctor.find().sort({ name: 1 }).limit(10)],
      ['doctors text', Doctor.find({ $text: { $search: 'Cardiology' } }).limit(10)],
      ['patients doctor', Patient.find({ doctor: doctor._id }).sort({ registeredAt: -1 }).limit(10)],
      ['patients condition', Patient.find({ condition: 'Hypertension' }).sort({ registeredAt: -1 }).limit(10)],
      ['patients gender', Patient.find({ gender: 'female' }).sort({ registeredAt: -1 }).limit(10)],
      ['patients phone', Patient.find({ phone: { $regex: '^0176' } }).limit(10)],
      ['patients name', Patient.find().sort({ name: 1 }).limit(10)],
      [
        'patients registeredAt',
        Patient.find({ registeredAt: { $gte: new Date('2020-01-01T00:00:00.000Z') } })
          .sort({ registeredAt: -1 })
          .limit(10),
      ],
    ];

    for (const [name, query] of queries) {
      const plan = collectPlan(await query.explain());
      console.log(`${name}: ${plan.stages.join(' -> ')} [${plan.indexes.join(', ')}]`);
      assert.equal(plan.stages.includes('COLLSCAN'), false, plan.stages.join(' -> '));
      assert.ok(plan.indexes.length > 0, plan.stages.join(' -> '));
    }

    const aggregates: Array<[string, { explain: (verbosity: string) => Promise<unknown> }]> = [
      [
        'timeseries',
        Patient.aggregate([
          { $match: { registeredAt: { $gte: new Date('2020-01-01T00:00:00.000Z') } } },
          {
            $group: {
              _id: {
                $dateTrunc: { date: '$registeredAt', unit: 'day', timezone: 'UTC' },
              },
              count: { $sum: 1 },
            },
          },
        ]),
      ],
      [
        'conditions',
        Patient.aggregate([
          { $match: { condition: { $gte: '' } } },
          { $group: { _id: '$condition', count: { $sum: 1 } } },
        ]),
      ],
      [
        'specializations',
        Doctor.aggregate([
          { $match: { specialization: { $gte: '' } } },
          { $group: { _id: '$specialization', count: { $sum: 1 } } },
        ]),
      ],
    ];

    for (const [name, aggregate] of aggregates) {
      const plan = collectPlan(await aggregate.explain('queryPlanner'));
      console.log(`${name}: ${plan.stages.join(' -> ')} [${plan.indexes.join(', ')}]`);
      assert.equal(plan.stages.includes('COLLSCAN'), false, `${name} ${plan.stages.join(' -> ')}`);
      assert.ok(plan.indexes.length > 0, name);
    }
  });
});
