-- PRESTINE — 2Factor.in as the hosted OTP provider
--
-- Adds a third value to `otp_provider` for 2Factor.in's hosted OTP flow, alongside
-- the existing `'local'` (this app generates and hashes the code) and
-- `'twilio-verify'` (kept for any in-flight rows from before this switch, though
-- no new row is ever written with it once TWILIO_VERIFY_SERVICE_SID is removed from
-- the environment — see src/server/otp.ts).
--
-- 2Factor's hosted flow needs one thing Twilio Verify's does not: a session id.
-- Twilio Verify's check-code call takes the phone number and code alone, so nothing
-- extra had to be stored. 2Factor's verify call is `SMS/VERIFY/{session_id}/{otp}`
-- — the session id from the send call is mandatory to check a code against — so a
-- nullable `provider_ref` column is added to hold it. Null for `'local'` and
-- `'twilio-verify'` rows, which have nothing to put there.

alter type otp_provider add value if not exists '2factor';

alter table phone_verifications
  add column if not exists provider_ref text;

comment on column phone_verifications.provider_ref is
  '2Factor.in''s session id from the AUTOGEN call, required to verify a code against SMS/VERIFY/{session_id}/{otp}. Null for the local and twilio-verify providers, which do not need one.';
