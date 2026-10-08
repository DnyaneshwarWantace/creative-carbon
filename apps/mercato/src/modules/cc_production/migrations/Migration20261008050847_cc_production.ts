import { Migration } from '@mikro-orm/migrations';

export class Migration20261008050847_cc_production extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_moulding_entries" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "entry_date" text not null, "shift" int not null, "press_id" uuid not null, "press_number" int not null, "mould_id" uuid not null, "die_no" text not null, "customer_name" text null, "die_heat_time" text null, "order_qty" int null, "order_ref" text null, "prior_made" int null, "article_weight_kg" numeric(12,3) not null, "chindi_product_id" uuid null, "chindi_kg" numeric(12,3) null, "cloth_product_id" uuid null, "cloth_kg" numeric(12,3) null, "cloth_note" text null, "bstage_grade" text null, "bstage_kg" numeric(12,3) null, "production_nos" int not null, "start_time" text null, "operator_name" text null, "top_temp" text null, "bottom_temp" text null, "curing_time" text null, "picks" jsonb null, "output_product_id" uuid null, "output_lot_id" uuid null, "output_lot_number" text null, "status" text not null default 'draft', "posted_at" timestamptz null, "posted_by_name" text null, "history" jsonb null, "updated_by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create unique index "cc_moulding_entries_cell_unique_idx" on "cc_moulding_entries" ("organization_id", "entry_date", "shift", "press_id") where deleted_at is null;`);
    this.addSql(`create index "cc_moulding_entries_mould_idx" on "cc_moulding_entries" ("organization_id", "mould_id");`);
    this.addSql(`create index "cc_moulding_entries_scope_idx" on "cc_moulding_entries" ("organization_id", "tenant_id", "entry_date");`);

    this.addSql(`create table "cc_moulding_signoffs" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "entry_date" text not null, "shift" int not null, "shift_incharge" text null, "shift_incharge_at" timestamptz null, "store_incharge" text null, "store_incharge_at" timestamptz null, "authorised" text null, "authorised_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create unique index "cc_moulding_signoffs_unique_idx" on "cc_moulding_signoffs" ("organization_id", "entry_date", "shift");`);
  }

}
