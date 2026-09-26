import { Migration } from '@mikro-orm/migrations';

export class Migration20260926163911_dermat_lists extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "dermat_list_options" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "list_key" text not null, "value" text not null, "position" int not null, "is_active" boolean not null default true, "updated_by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "dermat_list_options_scope_idx" on "dermat_list_options" ("organization_id", "tenant_id", "list_key");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "dermat_list_options" cascade;`);
  }

}
