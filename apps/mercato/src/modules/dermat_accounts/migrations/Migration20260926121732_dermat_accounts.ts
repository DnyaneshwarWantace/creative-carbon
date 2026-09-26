import { Migration } from '@mikro-orm/migrations';

export class Migration20260926121732_dermat_accounts extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "dermat_tax_invoices" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "kind" text not null default 'invoice', "against_id" uuid null, "against_code" text null, "order_id" uuid not null, "order_no" text not null, "customer_id" uuid not null, "customer_name" text not null, "customer_gstin" text null, "customer_address" text null, "invoice_date" text not null, "due_date" text null, "status" text not null default 'draft', "inter_state" boolean not null default false, "place_of_supply" text null, "prices_include_gst" boolean not null default false, "lines" jsonb not null, "totals" jsonb not null, "transporter" text null, "vehicle_no" text null, "lr_no" text null, "eway_bill_no" text null, "terms" text null, "bank_details" text null, "notes" text null, "issued_at" timestamptz null, "issued_by_name" text null, "created_by_name" text null, "cancel_reason" text null, "history" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "dermat_tax_invoices_order_idx" on "dermat_tax_invoices" ("organization_id", "tenant_id", "order_id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "dermat_tax_invoices" cascade;`);
  }

}
