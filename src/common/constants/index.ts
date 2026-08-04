/**
 * Shared enums used across the entire MaternIn backend.
 * All enum values follow snake_case convention per PRD.
 */

export enum UserRole {
  IBU_HAMIL = 'ibu_hamil',
  BIDAN = 'bidan',
  KADER = 'kader',
  ADMIN = 'admin',
}

export enum PregnancyStatus {
  HAMIL = 'hamil',
  NIFAS = 'nifas',
  SELESAI = 'selesai',
}

export enum PregnancyOutcome {
  PERSALINAN = 'persalinan',
  KEGUGURAN = 'keguguran',
}

export enum RiskBadge {
  HIJAU = 'hijau',
  KUNING = 'kuning',
  MERAH = 'merah',
}

export enum AncSource {
  SELF = 'self',
  NAKES = 'nakes',
  KADER_OFFLINE = 'kader_offline',
}

export enum CheckinType {
  PREGNANCY = 'pregnancy',
}

export enum BleedingLevel {
  NORMAL = 'normal',
  BANYAK = 'banyak',
  SANGAT_BANYAK = 'sangat_banyak',
}

export enum WoundCondition {
  BAIK = 'baik',
  BAU = 'bau',
  BENGKAK_MERAH = 'bengkak_merah',
}

export enum MoodFlag {
  BAIK = 'baik',
  KADANG_SEDIH = 'kadang_sedih',
  SERING_SEDIH = 'sering_sedih',
}

export enum NotificationChannel {
  WA_PATIENT = 'wa_patient',
  WA_BIDAN = 'wa_bidan',
  WA_FAMILY = 'wa_family',
  IN_APP = 'in_app',
}

export enum NotificationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  NO_DEVICE_FALLBACK = 'no_device_fallback',
}

export enum ReminderType {
  ANC_CHECKUP = 'anc_checkup',
  POSTPARTUM_CHECKIN = 'postpartum_checkin',
}

export enum ReminderStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  DONE = 'done',
}

export enum NotifyOn {
  MERAH_ONLY = 'merah_only',
  SEMUA_PERUBAHAN = 'semua_perubahan',
}

export enum SyncPayloadType {
  ANC_RECORD = 'anc_record',
  SYMPTOM_CHECKIN = 'symptom_checkin',
}

export enum SyncStatus {
  PENDING = 'pending',
  PROCESSED = 'processed',
  FAILED = 'failed',
}

export enum SymptomSource {
  SELF = 'self',
  KADER_OFFLINE = 'kader_offline',
}

export enum ChatSenderType {
  USER = 'user',
  AI = 'ai',
}

export enum ConsultationStatus {
  OPEN = 'open',
  CLOSED = 'closed',
}
