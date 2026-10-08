import { Migration } from '@mikro-orm/migrations';

export class Migration20261008072333_cc_orders extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_order_allocations" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "order_id" uuid not null, "line_id" uuid not null, "product_id" uuid not null, "lot_id" uuid not null, "lot_number" text not null, "place" text not null, "qty" numeric(14,3) not null, "unit" text not null, "reservation_id" uuid null, "status" text not null default 'reserved', "shipped_qty" numeric(14,3) not null default '0', "shipments" jsonb null, "by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "cc_order_allocations_lot_idx" on "cc_order_allocations" ("organization_id", "lot_id");`);
    this.addSql(`create index "cc_order_allocations_order_idx" on "cc_order_allocations" ("organization_id", "order_id");`);

    this.addSql(`create table "cc_order_packings" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "order_id" uuid not null, "line_id" uuid not null, "weights" jsonb not null, "packed_qty" numeric(14,3) not null, "unit" text not null, "notes" text null, "by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "cc_order_packings_order_idx" on "cc_order_packings" ("organization_id", "order_id");`);
  }

}
