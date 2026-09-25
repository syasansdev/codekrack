import assert from 'node:assert/strict';
import { serializeInstitution } from '../utils/serialize.js';

const row = {
  id: 'inst-1',
  name: 'Test College',
  code: 'TC',
  address: 'Main St',
  contact_email: 'hello@testcollege.edu',
  logo_url: 'https://example.com/logo.png',
  logo_public_id: 'institution-logos/test-college',
  admin_email: null,
  admin_id: null,
  admin_name: null,
  admin_password: null,
  student_count: 0,
  created_at: null,
  updated_at: null,
  created_by: null,
};

const institution = serializeInstitution(row);
assert.equal(institution.logoUrl, 'https://example.com/logo.png');
assert.equal(institution.logoPublicId, 'institution-logos/test-college');

console.log('logoPublicId serializer contract is intact.');
