import { Migration } from '@mikro-orm/migrations';

export class Migration20260925081055_dermat_workflow extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "dermat_material_plans" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "plan_number" text not null, "name" text null, "status" text not null default 'draft', "notes" text null, "created_by" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "dermat_material_plans_org_tenant_idx" on "dermat_material_plans" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "dermat_material_plans" add constraint "dermat_material_plans_number_uq" unique ("organization_id", "tenant_id", "plan_number");`);

    this.addSql(`create table "dermat_material_plan_items" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "plan_id" uuid not null, "bom_id" uuid not null, "bom_name" text null, "product_id" uuid null, "order_id" uuid null, "order_number" text null, "quantity_pcs" numeric(18,4) not null, "pack_size_grams" numeric(18,4) null, "bulk_kg" numeric(18,4) not null, "sequence" int not null default 0, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "dermat_material_plan_items_plan_idx" on "dermat_material_plan_items" ("plan_id");`);

    this.addSql(`create table "dermat_material_requests" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "request_number" text not null, "plan_id" uuid not null, "plan_number" text null, "store" text not null, "status" text not null default 'requested', "requested_by" text null, "issued_by" text null, "issued_at" timestamptz null, "notes" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "dermat_material_requests_plan_idx" on "dermat_material_requests" ("plan_id");`);
    this.addSql(`create index "dermat_material_requests_org_tenant_idx" on "dermat_material_requests" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "dermat_material_requests" add constraint "dermat_material_requests_number_uq" unique ("organization_id", "tenant_id", "request_number");`);

    this.addSql(`create table "dermat_material_request_lines" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "request_id" uuid not null, "material_id" uuid not null, "material_code" text null, "material_name" text null, "unit" text null, "required_qty" numeric(18,4) not null, "stock_at_request" numeric(18,4) not null, "issued_qty" numeric(18,4) null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "dermat_material_request_lines_request_idx" on "dermat_material_request_lines" ("request_id");`);

    this.addSql(`alter table "dermat_stock_reservations" add "plan_id" uuid null, add "plan_number" text null;`);
    this.addSql(`alter table "dermat_stock_reservations" alter column "order_id" drop not null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "dermat_stock_reservations" drop column "plan_id", drop column "plan_number";`);
    this.addSql(`alter table "dermat_stock_reservations" alter column "order_id" set not null;`);
    this.addSql(`drop table if exists "dermat_material_request_lines";`);
    this.addSql(`drop table if exists "dermat_material_requests";`);
    this.addSql(`drop table if exists "dermat_material_plan_items";`);
    this.addSql(`drop table if exists "dermat_material_plans";`);
  }

}
