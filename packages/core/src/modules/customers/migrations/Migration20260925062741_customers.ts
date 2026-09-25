import { Migration } from '@mikro-orm/migrations';

export class Migration20260925062741_customers extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table if not exists "customer_contacts" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text not null, "phone" text null, "email" text null, "sort_order" int not null default 0, "created_at" timestamptz not null, "updated_at" timestamptz not null, "entity_id" uuid not null, primary key ("id"));`);
    this.addSql(`create index if not exists "customer_contacts_entity_idx" on "customer_contacts" ("entity_id");`);

    this.addSql(`do $$ begin
      if not exists (select 1 from pg_constraint where conname = 'customer_contacts_entity_id_foreign') then
        alter table "customer_contacts" add constraint "customer_contacts_entity_id_foreign" foreign key ("entity_id") references "customer_entities" ("id");
      end if;
    end $$;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "customer_contacts";`);
  }

}
