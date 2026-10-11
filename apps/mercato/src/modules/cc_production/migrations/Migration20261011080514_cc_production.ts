import { Migration } from '@mikro-orm/migrations';

export class Migration20261011080514_cc_production extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_damage_entries" add "status" text not null default 'posted';`);

    this.addSql(`alter table "cc_lab_tests" add "revision" int not null default 0, add "issued_at" timestamptz null, add "issued_by_name" text null, add "revisions" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_damage_entries" drop column "status";`);

    this.addSql(`alter table "cc_lab_tests" drop column "revision", drop column "issued_at", drop column "issued_by_name", drop column "revisions";`);
  }

}
