import { Migration } from '@mikro-orm/migrations';

export class Migration20260925062742_dermat_workflow extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "dermat_stage_definitions" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "name" text not null, "subject_type" text not null, "phase" text null, "phase_label" text null, "unit" text null, "sequence" int not null, "department" text not null, "kind" text not null, "fields" jsonb not null default '[]', "config" jsonb not null default '{}', "is_optional" boolean not null default false, "is_automatic" boolean not null default false, "is_active" boolean not null default true, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "dermat_stage_definitions_org_tenant_idx" on "dermat_stage_definitions" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "dermat_stage_definitions" add constraint "dermat_stage_definitions_org_tenant_code_uq" unique ("organization_id", "tenant_id", "code");`);

    this.addSql(`create table "dermat_stage_runs" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "order_id" uuid not null, "order_number" text null, "customer_name" text null, "subject_type" text not null, "subject_id" uuid not null, "stage_code" text not null, "status" text not null default 'in_progress', "data" jsonb not null default '{}', "batch_number" text null, "product_id" uuid null, "product_name" text null, "product_code" text null, "quantity" numeric(18,4) null, "started_at" timestamptz null, "completed_at" timestamptz null, "completed_by" text null, "revert_reason" text null, "reverted_at" timestamptz null, "reverted_by" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "dermat_stage_runs_status_idx" on "dermat_stage_runs" ("organization_id", "status", "stage_code");`);
    this.addSql(`create index "dermat_stage_runs_subject_idx" on "dermat_stage_runs" ("subject_type", "subject_id", "stage_code");`);
    this.addSql(`create index "dermat_stage_runs_order_idx" on "dermat_stage_runs" ("order_id");`);
    this.addSql(`create index "dermat_stage_runs_org_tenant_idx" on "dermat_stage_runs" ("organization_id", "tenant_id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "dermat_stage_runs";`);
    this.addSql(`drop table if exists "dermat_stage_definitions";`);
  }

}
