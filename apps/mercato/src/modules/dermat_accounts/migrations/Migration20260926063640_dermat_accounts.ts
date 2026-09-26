import { Migration } from '@mikro-orm/migrations';

export class Migration20260926063640_dermat_accounts extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "dermat_order_payments" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "order_id" uuid not null, "order_no" text not null, "kind" text not null, "amount" numeric(14,2) not null, "paid_on" text not null, "mode" text null, "reference" text null, "note" text null, "by_name" text null, "voided_at" timestamptz null, "void_reason" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "dermat_order_payments_order_idx" on "dermat_order_payments" ("organization_id", "tenant_id", "order_id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "dermat_order_payments" cascade;`);
  }

}
