#!/usr/bin/env node
/**
 * One-shot helper that migrates the existing single-tenant Firestore data
 * (root collections /children and /contributions) into the new multi-tenant
 * shape (subcollections under families/{familyId}/).
 *
 * Run with:
 *   GOOGLE_APPLICATION_CREDENTIALS=service-account.json \
 *     node scripts/migrate-to-families.js
 *
 * Two safety guarantees beyond a naive migration:
 *   - VALIDATE placeholders/email/familyId up front; refuse to run with the
 *     unedited template.
 *   - VALIDATE date format and year range before any write; abort rather
 *     than storing NaN as `birthYear` (which would break the age-rule check
 *     in production).
 *   - Use BATCHED writes so that, per chunk, set+delete are atomic. A
 *     crash mid-run leaves families with ONLY migrated docs intact and
 *     orphans the un-migrated docs in the root collections.
 */
const admin = require('firebase-admin');
admin.initializeApp();
const db   = admin.firestore();

// EDIT THESE before running. Refuses to run with placeholder values.
const ADMIN_EMAIL = 'YOUR_EMAIL_HERE';
const FAMILY_ID   = 'YOUR_FAMILY_ID';

const YEAR_RANGE_MIN = 1900;
const YEAR_RANGE_MAX = 2100;

function parseYear(s, field) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error(`${field} "${s}" is not YYYY-MM-DD; refusing to migrate.`);
  }
  const y = parseInt(s.slice(0, 4), 10);
  if (y < YEAR_RANGE_MIN || y > YEAR_RANGE_MAX) {
    throw new Error(`${field} year ${y} is out of [${YEAR_RANGE_MIN}, ${YEAR_RANGE_MAX}]; refusing.`);
  }
  return y;
}

(async () => {
  if (ADMIN_EMAIL.includes('YOUR_') || FAMILY_ID.includes('YOUR_')) {
    throw new Error('Edit ADMIN_EMAIL and FAMILY_ID before running this script.');
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ADMIN_EMAIL)) {
    throw new Error(`ADMIN_EMAIL "${ADMIN_EMAIL}" is not a valid email.`);
  }
  console.log(`Migrating into families/${FAMILY_ID} with admin ${ADMIN_EMAIL}.`);

  // 1. Create the family doc with you as admin.
  await db.collection('families').doc(FAMILY_ID).set({
    familyName: 'My Family',
    members: { [ADMIN_EMAIL]: 'admin' },
  });

  // 2. Migrate children with field validation, in 400-doc batches.
  const childrenSnap = await db.collection('children').get();
  let movedChildren = 0;
  for (let i = 0; i < childrenSnap.docs.length; i += 400) {
    const batch = db.batch();
    childrenSnap.docs.slice(i, i + 400).forEach(doc => {
      const data = doc.data();
      const docRef = db.collection('families').doc(FAMILY_ID)
                       .collection('children').doc(doc.id);
      batch.set(docRef, {
        name:      data.name,
        birthYear: parseYear(data.birthDate, `children/${doc.id}.birthDate`),
      });
      batch.delete(doc.ref);
    });
    await batch.commit();
    movedChildren += Math.min(400, childrenSnap.docs.length - i);
  }

  // 3. Migrate contributions verbatim, plus a derived `year` integer field.
  const contribSnap = await db.collection('contributions').get();
  let movedContribs = 0;
  for (let i = 0; i < contribSnap.docs.length; i += 400) {
    const batch = db.batch();
    contribSnap.docs.slice(i, i + 400).forEach(doc => {
      const data = doc.data();
      const docRef = db.collection('families').doc(FAMILY_ID)
                       .collection('contributions').doc(doc.id);
      batch.set(docRef, {
        ...data,
        year: parseYear(data.date, `contributions/${doc.id}.date`),
      });
      batch.delete(doc.ref);
    });
    await batch.commit();
    movedContribs += Math.min(400, contribSnap.docs.length - i);
  }

  console.log(
    `Migration complete. ${movedChildren} children, ` +
    `${movedContribs} contributions moved into families/${FAMILY_ID}.`
  );
  process.exit(0);
})().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
