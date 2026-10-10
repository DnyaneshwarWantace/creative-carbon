import { Migration } from '@mikro-orm/migrations';

export class Migration20261010165408_cc_crm extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_quotations" add "revision" int not null default 1, add "revisions" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_quotations" drop column "revision", drop column "revisions";`);
  }

}
