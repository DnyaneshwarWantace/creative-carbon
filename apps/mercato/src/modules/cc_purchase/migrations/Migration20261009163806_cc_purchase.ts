import { Migration } from '@mikro-orm/migrations';

export class Migration20261009163806_cc_purchase extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_job_work_challans" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "vendor_id" uuid not null, "vendor_name" text not null, "vendor_gstin" text null, "challan_date" text not null, "process" text not null, "expected_return" text null, "vehicle_no" text null, "notes" text null, "status" text not null default 'open', "lines" jsonb not null, "returns" jsonb not null, "history" jsonb not null, "created_by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "cc_job_work_challans_scope_idx" on "cc_job_work_challans" ("organization_id", "tenant_id", "status");`);
    this.addSql(`alter table "cc_job_work_challans" add constraint "cc_job_work_challans_code_uq" unique ("organization_id", "tenant_id", "code");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "cc_job_work_challans";`);
  }

}
