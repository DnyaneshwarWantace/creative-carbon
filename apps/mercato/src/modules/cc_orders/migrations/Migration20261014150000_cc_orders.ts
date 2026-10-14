import { Migration } from '@mikro-orm/migrations';

export class Migration20261014150000_cc_orders extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_order_po" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "order_id" uuid not null, "details" jsonb null, "lines" jsonb null, "documents" jsonb null, "amendments" jsonb null, "acknowledged_at" timestamptz null, "acknowledged_by_name" text null, "updated_by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "cc_order_po_scope_idx" on "cc_order_po" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "cc_order_po" add constraint "cc_order_po_order_uq" unique ("organization_id", "tenant_id", "order_id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "cc_order_po" cascade;`);
  }

}
