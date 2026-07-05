# FC.OS Domain Foundation (Sprint 3)

Welcome to the permanent domain architecture of the **Field Collection Operating System (FC.OS)**. This directory defines the baseline structural types, business rules, enums, query parameters, formatting utilities, validation logic, and architectural contracts used consistently across all current and future modules.

---

## 1. Shared Domain Diagram & Architecture

The FC.OS Domain Foundation is organized under a strict clean-architecture layered layout:

```
                  ┌─────────────────────────────────────┐
                  │            APPLICATION              │
                  │      (Use Cases / Interactors)      │
                  └──────────────────┬──────────────────┘
                                     │ (depends on)
                                     ▼
                  ┌─────────────────────────────────────┐
                  │               DOMAIN                │
                  │  (Entities, Enums, DTOs, Mappers)   │
                  └──────────────────┬──────────────────┘
                                     │ (depends on)
                                     ▼
                  ┌─────────────────────────────────────┐
                  │             INFRASTRUCTURE          │
                  │       (Repositories, Database)      │
                  └─────────────────────────────────────┘
```

---

## 2. Entity Relationship Overview

Every physical entity in FC.OS inherits standard sync and tracing attributes from `BaseEntity`. Relationships are maintained via strict foreign key IDs:

```
   ┌────────────────────────────────────────────────────────┐
   │                       BaseEntity                       │
   ├────────────────────────────────────────────────────────┤
   │ - id: ID                                               │
   │ - uuid: UUID                                           │
   │ - createdAt: string (ISO 8601)                         │
   │ - updatedAt: string (ISO 8601)                         │
   │ - deletedAt: string | null                             │
   │ - isDeleted: boolean                                   │
   │ - version: number                                      │
   │ - syncStatus: SyncStatus                               │
   │ - createdBy: string                                    │
   │ - updatedBy: string                                    │
   └──────────────────────────┬─────────────────────────────┘
                              │ (Inherited by)
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
   ┌──────────┐         ┌──────────┐         ┌──────────┐
   │ Customer │         │  Visit   │         │ Payment  │
   ├──────────┤         ├──────────┤         ├──────────┤
   │ (Base)   │         │ (Base)   │         │ (Base)   │
   │ - name   │         │ - custId ┼─┐       │ - custId ┼─┐
   │ - status │         │ - collId ┼───┐     │ - collId ┼───┐
   │ - balance│         │ - notes  │ │ │     │ - amount │ │ │
   └────▲─────┘         └──────────┘ │ │     └──────────┘ │ │
        │                            │ │                  │ │
        │      References            │ │                  │ │
        └────────────────────────────┘ └──────────────────┘ │
                                       │                    │
                                       ▼  References        ▼
                                   ┌──────────────────────────┐
                                   │        Collector         │
                                   ├──────────────────────────┤
                                   │ - id: string             │
                                   │ - fullName: string       │
                                   └──────────────────────────┘
```

---

## 3. Type Hierarchy & Value Objects

### Primitive Type Aliases & Structs
* **`ID`**: `string` - Base physical record identifier.
* **`UUID`**: `string` - Sync identifier.
* **`Money`**: `number` - Fixed representation of monetary values.
* **`Percentage`**: `number` - Progress values ($0.0 \rightarrow 1.0$).
* **`PhoneNumber`**: `string` - Raw dial strings.
* **`Coordinate`**: Geo-location latitude, longitude, and precision metrics.
* **`DateRange`**: Closed date spans for query operations.
* **`Address`**: Structural component-based postal address object.

---

## 4. Shared Enums

1. **`Status`**: General record state (`ACTIVE`, `INACTIVE`, `ARCHIVED`).
2. **`VisitStatus`**: Outcomes of visit activities (`CONTACT`, `NO_CONTACT`, `BUSINESS_CLOSED`, `ADDRESS_NOT_FOUND`).
3. **`PaymentStatus`**: Financial transaction state (`PENDING`, `PAID`, `FAILED`).
4. **`SyncStatus`**: Synchronization stages (`pending`, `syncing`, `synced`, `failed`).
5. **`CustomerStatus`**: Customer workflow progression (`PENDING`, `VISITED`, `PAID`, `PROMISED`).
6. **`PriorityLevel`**: Queue priorities (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
7. **`ReminderStatus`**: Alarm transitions (`PENDING`, `SENT`, `DISMISSED`).
8. **`ConnectionStatus`**: Networking modes (`ONLINE`, `OFFLINE`).

---

## 5. Validation Flow

Validations are wrapped in the robust `Result<T>` monad. Validations perform sequence guards rather than crashing:

```
Input Data
   │
   ▼
┌──────────────────────────────────────┐
│        DomainValidator Checks        │
├──────────────────────────────────────┤
│ 1. required()   --> Null / Blank     │
│ 2. format()     --> Regex Match      │
│ 3. constraints() --> Values / Range  │
└──────────────────┬───────────────────┘
                   │
         ┌─────────┴─────────┐
         ▼ (Success)         ▼ (Validation Failure)
 ┌───────────────┐   ┌──────────────────────────────────────────────┐
 │ Result: True  │   │ Result: False                                │
 │ (error: null) │   │ (error: { code: "VALIDATION_ERROR", msg })   │
 └───────────────┘   └──────────────────────────────────────────────┘
```

---

## 6. Contracts

### IRepository<T>
Prescribes a uniform repository lifecycle with CRUD operations, pagination, search criteria, soft-deletion, and built-in model validation.

### IUseCase<TRequest, TResponse>
Every piece of business logic is encapsulated in a use-case interactor class conforming to this single execution pattern, optimizing predictability and debuggability.
