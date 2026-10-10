import { Migration } from '@mikro-orm/migrations';

export class Migration20261010162911_cc_accounts extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_debit_notes" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "vendor_bill_id" uuid not null, "bill_code" text not null, "vendor_id" uuid not null, "vendor_name" text not null, "note_date" text not null, "reason" text not null, "taxable" numeric(14,2) not null, "gst" numeric(14,2) not null, "total" numeric(14,2) not null, "status" text not null default 'issued', "cancel_reason" text null, "history" jsonb null, "created_by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "cc_debit_notes_bill_idx" on "cc_debit_notes" ("organization_id", "tenant_id", "vendor_bill_id");`);
    this.addSql(`alter table "cc_debit_notes" add constraint "cc_debit_notes_code_uq" unique ("organization_id", "tenant_id", "code");`);

    this.addSql(`alter table "cc_vendor_bills" add "debited" numeric(14,2) not null default '0';`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_vendor_bills" drop column "debited";`);
    this.addSql(`drop table if exists "cc_debit_notes" cascade;`);
  }

}
