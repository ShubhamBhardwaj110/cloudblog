function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

/** Lazily read so unit tests can import modules without a full environment. */
export const env = {
  get postsTable() { return required('POSTS_TABLE'); },
  get commentsTable() { return required('COMMENTS_TABLE'); },
  get viewsTable() { return required('VIEWS_TABLE'); },
  get siteBucket() { return required('SITE_BUCKET'); },
  get mediaBucket() { return required('MEDIA_BUCKET'); },
  get mediaBaseUrl() { return required('MEDIA_BASE_URL'); },
  get siteUrl() { return required('SITE_URL').replace(/\/$/, ''); },
  get siteTitle() { return process.env.SITE_TITLE ?? 'CloudBlog'; },
  get siteDescription() { return process.env.SITE_DESCRIPTION ?? 'Stories, notes and ideas.'; },
  get alertsTopicArn() { return process.env.ALERTS_TOPIC_ARN; },
  get distributionId() { return process.env.DISTRIBUTION_ID; },
  get adminGroup() { return process.env.ADMIN_GROUP ?? 'admins'; },
};
