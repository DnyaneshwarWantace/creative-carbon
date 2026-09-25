import { Migration } from '@mikro-orm/migrations';

export class Migration20260925191951_dermat_quality extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "dermat_quality_checks" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "operation" text not null, "product_id" uuid not null, "order_id" uuid null, "order_no" text null, "stage_key" text null, "batch_no" text null, "rule_id" uuid null, "requires_chemical" boolean not null default true, "requires_micro" boolean not null default false, "chemical_status" text not null default 'pending', "micro_status" text not null default 'na', "status" text not null default 'pending', "results" jsonb null, "chemical_by" text null, "chemical_at" timestamptz null, "micro_by" text null, "micro_at" timestamptz null, "history" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "dermat_quality_checks_order_idx" on "dermat_quality_checks" ("order_id", "stage_key");`);
    this.addSql(`create index "dermat_quality_checks_scope_idx" on "dermat_quality_checks" ("organization_id", "tenant_id", "status");`);
    this.addSql(`alter table "dermat_quality_checks" add constraint "dermat_quality_checks_code_uq" unique ("organization_id", "tenant_id", "code");`);

    this.addSql(`create table "dermat_quality_rules" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "title" text not null, "operation" text not null, "product_id" uuid null, "requires_chemical" boolean not null default true, "requires_micro" boolean not null default false, "is_active" boolean not null default true, "parameters" jsonb null, "notes" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "dermat_quality_rules_scope_idx" on "dermat_quality_rules" ("organization_id", "tenant_id", "operation");`);
    this.addSql(`alter table "dermat_quality_rules" add constraint "dermat_quality_rules_code_uq" unique ("organization_id", "tenant_id", "code");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "dermat_quality_checks" cascade;`);
    this.addSql(`drop table if exists "dermat_quality_rules" cascade;`);
  }

}
