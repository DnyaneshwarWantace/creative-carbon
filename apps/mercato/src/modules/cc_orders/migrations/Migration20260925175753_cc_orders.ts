import { Migration } from '@mikro-orm/migrations';

export class Migration20260925175753_cc_orders extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_orders" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "order_no" text not null, "order_date" date not null, "delivery_date" date null, "customer_id" uuid not null, "customer_po_ref" text null, "order_type" text not null default 'new', "source_order_id" uuid null, "sales_manager" text null, "payment_terms" text null, "payment_remarks" text null, "product_remarks" text null, "billing_remarks" text null, "packing_remarks" text null, "status" text not null default 'booked', "created_by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "cc_orders_customer_idx" on "cc_orders" ("customer_id");`);
    this.addSql(`create index "cc_orders_org_tenant_idx" on "cc_orders" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "cc_orders" add constraint "cc_orders_org_no_uq" unique ("organization_id", "tenant_id", "order_no");`);

    this.addSql(`create table "cc_order_events" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "order_id" uuid not null, "stage_key" text null, "action" text not null, "note" text null, "by_name" text null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "cc_order_events_order_idx" on "cc_order_events" ("order_id");`);

    this.addSql(`create table "cc_order_lines" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "order_id" uuid not null, "position" int not null, "product_id" uuid not null, "brand_name" text null, "pack_size" text null, "mrp" numeric(12,2) null, "quantity" numeric(14,3) not null, "rate" numeric(12,2) null, "batch_no" text null, "specs" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "cc_order_lines_product_idx" on "cc_order_lines" ("product_id");`);
    this.addSql(`create index "cc_order_lines_order_idx" on "cc_order_lines" ("order_id");`);

    this.addSql(`create table "cc_order_stages" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "order_id" uuid not null, "stage_key" text not null, "status" text not null default 'waiting', "responsible_user_id" uuid null, "responsible_name" text null, "data" jsonb null, "hold_reason" text null, "hold_party" text null, "opened_at" timestamptz null, "completed_at" timestamptz null, "completed_by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "cc_order_stages_open_idx" on "cc_order_stages" ("tenant_id", "organization_id", "status");`);
    this.addSql(`create index "cc_order_stages_order_idx" on "cc_order_stages" ("order_id");`);
    this.addSql(`alter table "cc_order_stages" add constraint "cc_order_stages_order_key_uq" unique ("order_id", "stage_key");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "cc_order_events" cascade;`);
    this.addSql(`drop table if exists "cc_order_stages" cascade;`);
    this.addSql(`drop table if exists "cc_order_lines" cascade;`);
    this.addSql(`drop table if exists "cc_orders" cascade;`);
  }

}
