import { Migration } from '@mikro-orm/migrations';

export class Migration20260925074918_dermat_workflow extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "dermat_stock_reservations" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "order_id" uuid not null, "order_number" text null, "material_kind" text not null, "material_id" uuid not null, "material_code" text null, "material_name" text null, "unit" text null, "quantity" numeric(18,4) not null, "status" text not null default 'active', "reserved_by" text null, "closed_at" timestamptz null, "closed_by" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "dermat_stock_reservations_order_idx" on "dermat_stock_reservations" ("order_id", "status");`);
    this.addSql(`create index "dermat_stock_reservations_material_idx" on "dermat_stock_reservations" ("material_kind", "material_id", "status");`);
    this.addSql(`create index "dermat_stock_reservations_org_tenant_idx" on "dermat_stock_reservations" ("organization_id", "tenant_id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "dermat_stock_reservations";`);
  }

}
