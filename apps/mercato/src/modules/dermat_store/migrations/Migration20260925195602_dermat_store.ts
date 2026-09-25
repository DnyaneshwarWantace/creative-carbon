import { Migration } from '@mikro-orm/migrations';

export class Migration20260925195602_dermat_store extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "dermat_store_requests" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "order_id" uuid not null, "order_no" text not null, "stage_key" text not null, "store" text not null, "status" text not null default 'requested', "notes" text null, "requested_by_name" text null, "received_by_name" text null, "received_at" timestamptz null, "used_at" timestamptz null, "history" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "dermat_store_requests_order_idx" on "dermat_store_requests" ("order_id", "stage_key");`);
    this.addSql(`create index "dermat_store_requests_scope_idx" on "dermat_store_requests" ("organization_id", "tenant_id", "status");`);
    this.addSql(`alter table "dermat_store_requests" add constraint "dermat_store_requests_code_uq" unique ("organization_id", "tenant_id", "code");`);

    this.addSql(`create table "dermat_store_request_lines" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "request_id" uuid not null, "position" int not null, "product_id" uuid not null, "variant_id" uuid not null, "unit" text not null, "required_qty" numeric(14,4) not null, "issued_qty" numeric(14,4) not null default '0', "received_qty" numeric(14,4) not null default '0', "used_qty" numeric(14,4) not null default '0', "returned_qty" numeric(14,4) not null default '0', "issues" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "dermat_store_request_lines_product_idx" on "dermat_store_request_lines" ("organization_id", "tenant_id", "product_id");`);
    this.addSql(`create index "dermat_store_request_lines_request_idx" on "dermat_store_request_lines" ("request_id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "dermat_store_request_lines" cascade;`);
    this.addSql(`drop table if exists "dermat_store_requests" cascade;`);
  }

}
