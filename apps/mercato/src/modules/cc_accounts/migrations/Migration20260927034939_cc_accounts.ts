import { Migration } from '@mikro-orm/migrations';

export class Migration20260927034939_cc_accounts extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_vendor_bills" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "vendor_id" uuid not null, "vendor_name" text not null, "bill_no" text not null, "bill_date" text not null, "due_date" text null, "po_id" uuid null, "po_code" text null, "grn_ids" jsonb null, "grn_codes" jsonb null, "taxable" numeric(14,2) not null, "gst" numeric(14,2) not null, "total" numeric(14,2) not null, "paid" numeric(14,2) not null default '0', "status" text not null default 'open', "notes" text null, "payments" jsonb null, "history" jsonb null, "created_by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "cc_vendor_bills_vendor_idx" on "cc_vendor_bills" ("vendor_id");`);
    this.addSql(`create index "cc_vendor_bills_scope_idx" on "cc_vendor_bills" ("organization_id", "tenant_id", "status");`);
    this.addSql(`alter table "cc_vendor_bills" add constraint "cc_vendor_bills_code_uq" unique ("organization_id", "tenant_id", "code");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "cc_vendor_bills" cascade;`);
  }

}
