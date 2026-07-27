# ADR-0013: Multi-Profile Verification Architecture

**Status:** ACCEPTED  
**Date:** 2026-07-27

## Context
Mamet OS memiliki 3 capability modes (ASSISTANT, LITE, ENGINEER), namun VerificationEngine 
sebelumnya hanya memiliki 2 profile. Mode ENGINEER menghasilkan output JSON patch yang 
memiliki karakteristik berbeda dari chat natural.

## Decision
Memperluas VerificationEngine dengan 3 profile deterministik:
- ENGINEERING → untuk chat natural (butuh ADR trace)
- PERSONAL → untuk assistant ringan (sanity check)
- PATCH_ENGINEERING → untuk JSON patch (security + MAEF compliance)

Routing dilakukan via `VerificationEngine.verify(mode, context)` yang deterministik.

## Consequences
- ✅ Setiap mode punya verification profile yang sesuai
- ✅ Tidak ada bypass — semua mode diverifikasi ketat
- ✅ Hard Gate konsisten untuk semua mode (MAEF 4.5)
- ✅ Mudah diperluas untuk profile baru di masa depan