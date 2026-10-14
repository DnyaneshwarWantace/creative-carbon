import { Migration } from '@mikro-orm/migrations';

export class Migration20261014130000_cc_accounts extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_party_logos" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "party_kind" text not null, "party_id" uuid not null, "image_url" text not null, "updated_by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "cc_party_logos_scope_idx" on "cc_party_logos" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "cc_party_logos" add constraint "cc_party_logos_party_uq" unique ("organization_id", "tenant_id", "party_kind", "party_id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "cc_party_logos" cascade;`);
  }

}
