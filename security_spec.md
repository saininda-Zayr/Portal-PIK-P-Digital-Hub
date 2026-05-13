# Security Specification for SIM-ASN

## 1. Data Invariants
- A **User** profile must match the `request.auth.uid`.
- **Documents** and **Archives** must have an `uploadedBy` field matching the `request.auth.uid`.
- **Requests** can be created by anyone (public) but are managed by staff.
- **Stats** are read-only for authorized staff and managed by admins.
- **Tasks**, **Events**, and **Announcements** are read-only for authorized staff and managed by admins.
- **Admin** status is determined by a fallback email `saininda@gmail.com` or a `role: 'admin'` field in the user document.
- **Authorized** status is determined by `status: 'authorized'` in the user document or being an admin.

## 2. The "Dirty Dozen" Payloads (Attacks)
1. **Identity Spoofing**: Attempt to create a user profile for a different UID.
2. **Privilege Escalation**: Attempt to set `role: 'admin'` or `status: 'authorized'` on own profile.
3. **Ghost Update**: Attempt to update a document with fields not in the schema.
4. **ID Poisoning**: Attempt to create a document with a 1MB string as an ID.
5. **PII Leak**: Attempt to read the entire `users` collection without authorization.
6. **Query Scraping**: Attempt to list `documents` without an authorized status.
7. **Orphaned Write**: Attempt to create a document with an invalid year or category.
8. **Stat Tampering**: Attempt to update `stats` as a non-admin.
9. **Request Hijacking**: Attempt to update a request status as a non-admin.
10. **Immortality Breach**: Attempt to change `createdAt` on an existing document.
11. **Denial of Wallet**: Attempt to list `users` collection with a query that forces 1000s of reads (mitigated by rules).
12. **Status Shortcutting**: Attempt to move a request from `pending` to `completed` without `processing`.

## 3. Test Runner (Mock Tests)
- `test('Identity Spoofing'): expect(PERMISSION_DENIED)`
- `test('Privilege Escalation'): expect(PERMISSION_DENIED)`
- `test('Read stats without authorization'): expect(PERMISSION_DENIED)`
... (all 12 payloads must be rejected)
