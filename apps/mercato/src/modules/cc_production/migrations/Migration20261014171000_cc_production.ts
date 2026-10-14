import { Migration } from '@mikro-orm/migrations';

export class Migration20261014171000_cc_production extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_tc_templates" add "last_column" text not null default 'remark', add "legend" jsonb null;`);
    this.addSql(`alter table "cc_test_certificates" add "last_column" text not null default 'remark', add "legend" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_tc_templates" drop column "last_column", drop column "legend";`);
    this.addSql(`alter table "cc_test_certificates" drop column "last_column", drop column "legend";`);
  }

}
