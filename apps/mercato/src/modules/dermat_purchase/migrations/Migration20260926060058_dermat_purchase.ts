import { Migration } from '@mikro-orm/migrations';

export class Migration20260926060058_dermat_purchase extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "dermat_grns" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "po_id" uuid not null, "po_code" text not null, "vendor_id" uuid not null, "vendor_name" text not null, "grn_date" text not null, "invoice_no" text null, "invoice_date" text null, "status" text not null default 'under_test', "notes" text null, "received_by_name" text null, "history" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "dermat_grns_po_idx" on "dermat_grns" ("po_id");`);
    this.addSql(`create index "dermat_grns_scope_idx" on "dermat_grns" ("organization_id", "tenant_id", "status");`);
    this.addSql(`alter table "dermat_grns" add constraint "dermat_grns_code_uq" unique ("organization_id", "tenant_id", "code");`);

    this.addSql(`create table "dermat_grn_lines" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "grn_id" uuid not null, "po_line_id" uuid not null, "product_id" uuid not null, "variant_id" uuid not null, "unit" text not null, "store" text not null, "quantity" numeric(14,4) not null, "lot_id" uuid null, "lot_number" text not null, "mfg_date" text null, "expiry_date" text null, "qc_check_id" uuid null, "qc_status" text not null default 'pending', "returned_qty" numeric(14,4) not null default '0', "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "dermat_grn_lines_check_idx" on "dermat_grn_lines" ("qc_check_id");`);
    this.addSql(`create index "dermat_grn_lines_grn_idx" on "dermat_grn_lines" ("grn_id");`);

    this.addSql(`create table "dermat_pos" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "vendor_id" uuid not null, "vendor_name" text not null, "vendor_gstin" text null, "po_date" text not null, "expected_date" text null, "status" text not null default 'draft', "notes" text null, "terms" text null, "order_refs" jsonb null, "created_by_name" text null, "approved_by_name" text null, "approved_at" timestamptz null, "history" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "dermat_pos_scope_idx" on "dermat_pos" ("organization_id", "tenant_id", "status");`);
    this.addSql(`alter table "dermat_pos" add constraint "dermat_pos_code_uq" unique ("organization_id", "tenant_id", "code");`);

    this.addSql(`create table "dermat_po_lines" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "po_id" uuid not null, "position" int not null, "product_id" uuid not null, "unit" text not null, "quantity" numeric(14,4) not null, "rate" numeric(14,4) not null, "gst_percent" numeric(6,2) not null default '18', "received_qty" numeric(14,4) not null default '0', "notes" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "dermat_po_lines_product_idx" on "dermat_po_lines" ("organization_id", "tenant_id", "product_id");`);
    this.addSql(`create index "dermat_po_lines_po_idx" on "dermat_po_lines" ("po_id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "dermat_grn_lines" cascade;`);
    this.addSql(`drop table if exists "dermat_grns" cascade;`);
    this.addSql(`drop table if exists "dermat_po_lines" cascade;`);
    this.addSql(`drop table if exists "dermat_pos" cascade;`);
  }

}
