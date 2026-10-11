'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_ANON_KEY = '';
process.env.SUPABASE_SERVICE_KEY = '';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { app } = require('../server');
const mailer = require('../lib/mailer');

const DATA_DIR = path.join(__dirname, '..', 'data');
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'mock-notifications.json');
const USERS_FILE = path.join(DATA_DIR, 'mock-users.json');
const backups = {
  notifications: fs.existsSync(NOTIFICATIONS_FILE) ? fs.readFileSync(NOTIFICATIONS_FILE, 'utf8') : null,
  users: fs.existsSync(USERS_FILE) ? fs.readFileSync(USERS_FILE, 'utf8') : null,
};
const adminToken = jwt.sign({ userId: 'email-admin', email: 'admin@example.com', role: 'admin' }, process.env.JWT_SECRET);

afterEach(() => jest.restoreAllMocks());

afterAll(() => {
  for (const [file, backup] of [[NOTIFICATIONS_FILE, backups.notifications], [USERS_FILE, backups.users]]) {
    if (backup === null) fs.rmSync(file, { force: true });
    else fs.writeFileSync(file, backup);
  }
});

describe('notification email delivery', () => {
  test('sends directly targeted admin notices by email and escapes HTML content', async () => {
    jest.spyOn(mailer, 'isConfigured').mockReturnValue(true);
    const send = jest.spyOn(mailer, 'send').mockResolvedValue({ delivered: true });
    const response = await request(app)
      .post('/api/notifications')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({
        user_email: 'notice-recipient@example.com',
        title: '<script>important</script>',
        body: 'A <notice> & update',
      });

    expect(response.status).toBe(201);
    expect(response.body.email).toEqual({ configured: true, sent: 1, failed: 0, skipped: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toBe('notice-recipient@example.com');
    expect(send.mock.calls[0][0].html).not.toContain('<script>');
    expect(send.mock.calls[0][0].html).toContain('&lt;notice&gt;');
  });

  test('emails users when an admin broadcasts an important notice', async () => {
    const userEmail = 'broadcast-recipient@example.com';
    let users = {};
    if (fs.existsSync(USERS_FILE)) users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    users[userEmail] = { id: 'broadcast-user', email: userEmail, name: 'Recipient' };
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

    jest.spyOn(mailer, 'isConfigured').mockReturnValue(true);
    const send = jest.spyOn(mailer, 'send').mockResolvedValue({ delivered: true });
    const response = await request(app)
      .post('/api/admin/broadcast')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ title: 'Important service notice', body: 'Service maintenance tonight.' });

    expect(response.status).toBe(200);
    expect(response.body.email.configured).toBe(true);
    expect(response.body.email.sent).toBe(send.mock.calls.length);
    expect(response.body.email.failed).toBe(0);
    expect(send.mock.calls.some(call => call[0].to === userEmail)).toBe(true);
  });
});
