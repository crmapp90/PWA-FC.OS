-- ====================================================================
-- SUPABASE SQL SCHEMA MIGRATION FOR FC.OS (FIELD COLLECTION OPERATING SYSTEM)
-- ====================================================================
-- Copy and paste this script directly into your Supabase SQL Editor.
-- This ensures that your cloud-hosted database perfectly matches the 
-- offline-first Dexie payload schema, preventing any synchronization column errors.

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: customers
CREATE TABLE IF NOT EXISTS public.customers (
    id TEXT PRIMARY KEY,
    uuid UUID DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
    "deletedAt" TIMESTAMPTZ NULL,
    "isDeleted" BOOLEAN DEFAULT FALSE,
    version INT DEFAULT 1,
    "syncStatus" TEXT DEFAULT 'synced',
    "createdBy" TEXT DEFAULT 'system',
    "updatedBy" TEXT DEFAULT 'system',
    name TEXT NOT NULL,
    address TEXT,
    "phoneNumber" TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    "outstandingBalance" NUMERIC DEFAULT 0,
    "minPaymentDue" NUMERIC DEFAULT 0,
    "daysOverdue" INT DEFAULT 0,
    bucket TEXT, -- '30' | '60' | '90' | '90+'
    status TEXT, -- 'PENDING' | 'VISITED' | 'PAID' | 'PROMISED'
    "lastVisitDate" TIMESTAMPTZ NULL,
    notes TEXT,
    "contractNumber" TEXT,
    "alternativePhone" TEXT,
    area TEXT,
    branch TEXT,
    "priorityLevel" TEXT, -- 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
    "consecutiveMissedVisits" INT DEFAULT 0,
    "needsContactUpdate" BOOLEAN DEFAULT FALSE,
    "installmentAmount" NUMERIC DEFAULT 0,
    "dueDate" TEXT,
    "lastPaymentDate" TEXT,
    "lastContactDate" TEXT,
    "assignedCollectorId" TEXT
);

-- Table: visits
CREATE TABLE IF NOT EXISTS public.visits (
    id TEXT PRIMARY KEY,
    uuid UUID DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
    "deletedAt" TIMESTAMPTZ NULL,
    "isDeleted" BOOLEAN DEFAULT FALSE,
    version INT DEFAULT 1,
    "syncStatus" TEXT DEFAULT 'synced',
    "createdBy" TEXT DEFAULT 'system',
    "updatedBy" TEXT DEFAULT 'system',
    "customerId" TEXT REFERENCES public.customers(id) ON DELETE CASCADE,
    "collectorId" TEXT NOT NULL,
    "visitDate" TEXT,
    status TEXT, -- 'CONTACT' | 'NO_CONTACT' | 'BUSINESS_CLOSED' | 'ADDRESS_NOT_FOUND'
    notes TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    accuracy DOUBLE PRECISION,
    "photoUrl" TEXT,
    "startTime" TIMESTAMPTZ NULL,
    "endTime" TIMESTAMPTZ NULL,
    duration INT,
    "addressConfirmation" TEXT,
    "visitResult" TEXT,
    "visitStatus" TEXT,
    "customerCondition" TEXT,
    "collectorNotes" TEXT,
    "nextAction" TEXT,
    "followUpDate" TEXT,
    "attachmentCount" INT DEFAULT 0,
    "photoCount" INT DEFAULT 0,
    "voiceCount" INT DEFAULT 0,
    "signatureStatus" TEXT,
    "offlineStatus" TEXT,
    "photoUrls" TEXT[],
    "voiceUrl" TEXT,
    "signatureBase64" TEXT
);

-- Table: payments
CREATE TABLE IF NOT EXISTS public.payments (
    id TEXT PRIMARY KEY,
    uuid UUID DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
    "deletedAt" TIMESTAMPTZ NULL,
    "isDeleted" BOOLEAN DEFAULT FALSE,
    version INT DEFAULT 1,
    "syncStatus" TEXT DEFAULT 'synced',
    "createdBy" TEXT DEFAULT 'system',
    "updatedBy" TEXT DEFAULT 'system',
    "customerId" TEXT REFERENCES public.customers(id) ON DELETE CASCADE,
    "collectorId" TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    "paymentMethod" TEXT NOT NULL, -- 'CASH' | 'BANK_TRANSFER' | etc.
    "receiptNumber" TEXT NOT NULL,
    "signatureBase64" TEXT,
    "photoUrl" TEXT,
    "paymentDate" TEXT,
    "visitId" TEXT,
    "commitmentId" TEXT,
    "paymentTime" TEXT,
    "remainingOutstanding" NUMERIC,
    "installmentNumber" INT,
    "referenceNumber" TEXT,
    "evidenceCount" INT DEFAULT 0,
    "collectorNotes" TEXT,
    "customerNotes" TEXT,
    status TEXT
);

-- Table: promise_to_pay
CREATE TABLE IF NOT EXISTS public.promise_to_pay (
    id TEXT PRIMARY KEY,
    uuid UUID DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
    "deletedAt" TIMESTAMPTZ NULL,
    "isDeleted" BOOLEAN DEFAULT FALSE,
    version INT DEFAULT 1,
    "syncStatus" TEXT DEFAULT 'synced',
    "createdBy" TEXT DEFAULT 'system',
    "updatedBy" TEXT DEFAULT 'system',
    "customerId" TEXT REFERENCES public.customers(id) ON DELETE CASCADE,
    "collectorId" TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    "promiseDate" TEXT NOT NULL,
    notes TEXT,
    "visitId" TEXT,
    "commitmentDate" TEXT,
    "dueDate" TEXT,
    "promisedAmount" NUMERIC DEFAULT 0,
    "expectedPaymentMethod" TEXT,
    status TEXT,
    priority TEXT,
    "reminderDate" TEXT,
    "reminderTime" TEXT,
    "followUpDate" TEXT,
    "riskLevel" TEXT,
    reason TEXT,
    "collectorNotes" TEXT,
    "customerNotes" TEXT
);
