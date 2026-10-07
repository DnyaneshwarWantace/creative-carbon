import { Migration } from '@mikro-orm/migrations';

export class Migration20261007174748_cc_production extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_chemical_issues" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "issue_date" text not null, "product_id" uuid not null, "product_title" text not null, "kg" numeric(14,3) not null, "used_for" text not null, "dryer_code" text null, "note" text null, "lots" jsonb null, "status" text not null default 'posted', "by_name" text null, "history" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "cc_chemical_issues_scope_idx" on "cc_chemical_issues" ("organization_id", "tenant_id", "issue_date");`);

    this.addSql(`create table "cc_resin_batches" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "batch_no" text not null, "batch_date" text not null, "reactor_id" uuid not null, "reactor_code" text not null, "grade" text not null, "materials" jsonb not null, "process" jsonb not null, "tests" jsonb not null, "water_removed_kg" numeric(14,3) null, "yield_kg" numeric(14,3) null, "status" text not null default 'draft', "fail_reason" text null, "chemist_sign" text null, "chemist_signed_at" timestamptz null, "incharge_sign" text null, "incharge_signed_at" timestamptz null, "posted_at" timestamptz null, "posted_by_name" text null, "resin_product_id" uuid null, "resin_lot_id" uuid null, "resin_lot_number" text null, "notes" text null, "history" jsonb null, "updated_by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create unique index "cc_resin_batches_no_unique_idx" on "cc_resin_batches" ("organization_id", "batch_no") where deleted_at is null;`);
    this.addSql(`create index "cc_resin_batches_scope_idx" on "cc_resin_batches" ("organization_id", "tenant_id", "batch_date");`);
  }

}
