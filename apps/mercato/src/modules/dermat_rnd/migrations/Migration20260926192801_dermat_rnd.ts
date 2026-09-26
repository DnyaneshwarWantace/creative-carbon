import { Migration } from '@mikro-orm/migrations';

export class Migration20260926192801_dermat_rnd extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "dermat_rnd_requests" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "kind" text not null default 'client', "status" text not null default 'requested', "customer_id" uuid null, "customer_name" text null, "order_id" uuid null, "order_no" text null, "product_name" text not null, "brand" text null, "product_type" text null, "ingredients" text null, "texture" text null, "fragrance" text null, "colour" text null, "pack_size" text null, "notes" text null, "due_date" text null, "rounds" jsonb null, "requested_by_name" text null, "assigned_name" text null, "history" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "dermat_rnd_requests_scope_idx" on "dermat_rnd_requests" ("organization_id", "tenant_id", "status");`);
    this.addSql(`alter table "dermat_rnd_requests" add constraint "dermat_rnd_requests_code_uq" unique ("organization_id", "tenant_id", "code");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "dermat_rnd_requests" cascade;`);
  }

}
