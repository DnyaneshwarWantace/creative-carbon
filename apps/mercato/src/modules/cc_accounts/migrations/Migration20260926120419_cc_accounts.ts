import { Migration } from '@mikro-orm/migrations';

export class Migration20260926120419_cc_accounts extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_company_profiles" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text not null, "legal_name" text null, "gstin" text null, "pan" text null, "address" text null, "phone" text null, "email" text null, "website" text null, "bank_name" text null, "bank_branch" text null, "bank_account" text null, "bank_ifsc" text null, "upi_id" text null, "signatory" text null, "pi_terms" text null, "invoice_terms" text null, "pi_validity_days" int not null default 15, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "cc_company_profiles_scope_idx" on "cc_company_profiles" ("organization_id", "tenant_id");`);

    this.addSql(`create table "cc_proforma_invoices" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "order_id" uuid not null, "order_no" text not null, "customer_id" uuid not null, "customer_name" text not null, "customer_gstin" text null, "pi_date" text not null, "valid_until" text null, "status" text not null default 'draft', "advance_percent" numeric(6,2) null, "prices_include_gst" boolean not null default false, "lines" jsonb not null, "totals" jsonb not null, "terms" text null, "bank_details" text null, "notes" text null, "sent_at" timestamptz null, "sent_by_name" text null, "created_by_name" text null, "cancel_reason" text null, "history" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "cc_proforma_invoices_order_idx" on "cc_proforma_invoices" ("organization_id", "tenant_id", "order_id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "cc_proforma_invoices" cascade;`);
    this.addSql(`drop table if exists "cc_company_profiles" cascade;`);
  }

}
