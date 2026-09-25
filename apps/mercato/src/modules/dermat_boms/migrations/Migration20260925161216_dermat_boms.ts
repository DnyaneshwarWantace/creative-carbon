import { Migration } from '@mikro-orm/migrations';

export class Migration20260925161216_dermat_boms extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "dermat_bom_headers" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "product_id" uuid not null, "product_kind" text not null, "version" int not null default 1, "status" text not null default 'draft', "batch_size" numeric(14,3) not null, "batch_unit" text not null, "notes" text null, "created_by_name" text null, "approved_by_name" text null, "approved_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "dermat_bom_headers_product_idx" on "dermat_bom_headers" ("product_id");`);
    this.addSql(`create index "dermat_bom_headers_org_tenant_idx" on "dermat_bom_headers" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "dermat_bom_headers" add constraint "dermat_bom_headers_org_code_uq" unique ("organization_id", "tenant_id", "code");`);

    this.addSql(`create table "dermat_bom_items" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "bom_id" uuid not null, "position" int not null, "component_product_id" uuid not null, "component_kind" text not null, "percent" numeric(9,4) null, "qty_per_unit" numeric(14,5) null, "unit" text not null, "remark" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "dermat_bom_items_component_idx" on "dermat_bom_items" ("component_product_id");`);
    this.addSql(`create index "dermat_bom_items_bom_idx" on "dermat_bom_items" ("bom_id");`);
    this.addSql(`create unique index "dermat_bom_headers_one_draft_uq" on "dermat_bom_headers" ("product_id") where "status" = 'draft' and "deleted_at" is null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "dermat_bom_items" cascade;`);
    this.addSql(`drop table if exists "dermat_bom_headers" cascade;`);
  }

}
