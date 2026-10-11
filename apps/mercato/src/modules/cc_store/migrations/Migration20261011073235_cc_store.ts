import { Migration } from '@mikro-orm/migrations';

export class Migration20261011073235_cc_store extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_stocktakes" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "place" text not null, "count_date" text not null, "status" text not null default 'counted', "lines" jsonb not null, "note" text null, "counted_by_name" text null, "approved_by_name" text null, "approved_at" timestamptz null, "posted_by_name" text null, "posted_at" timestamptz null, "reversed_by_name" text null, "reversed_at" timestamptz null, "reverse_reason" text null, "history" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "cc_stocktakes_scope_idx" on "cc_stocktakes" ("organization_id", "tenant_id", "status");`);

    this.addSql(`create table "cc_store_adjustments" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "kind" text not null, "place" text not null, "to_place" text null, "product_id" uuid not null, "title" text not null, "unit" text null, "lot_id" uuid null, "lot_number" text null, "new_lot" jsonb null, "quantity" numeric(14,4) not null, "reason" text not null, "note" text null, "status" text not null default 'posted', "movement_id" uuid null, "reversal_id" uuid null, "created_by_name" text null, "created_by_user_id" uuid null, "approved_by_name" text null, "approved_at" timestamptz null, "reversed_by_name" text null, "reversed_at" timestamptz null, "reverse_reason" text null, "history" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "cc_store_adjustments_lot_idx" on "cc_store_adjustments" ("lot_id");`);
    this.addSql(`create index "cc_store_adjustments_scope_idx" on "cc_store_adjustments" ("organization_id", "tenant_id", "status");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "cc_store_adjustments" cascade;`);
    this.addSql(`drop table if exists "cc_stocktakes" cascade;`);
  }

}
