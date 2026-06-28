export const BLOG_POST_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title',
    'excerpt',
    'meta_description',
    'topic',
    'reading_time_minutes',
    'tags',
    'hero_image',
    'sections',
  ],
  properties: {
    title: { type: 'string' },
    excerpt: { type: 'string' },
    meta_description: { type: 'string' },
    topic: { type: 'string' },
    reading_time_minutes: { type: 'integer' },
    tags: {
      type: 'array',
      items: { type: 'string' },
      minItems: 2,
      maxItems: 6,
    },
    hero_image: {
      type: 'object',
      additionalProperties: false,
      required: ['url', 'credit', 'caption'],
      properties: {
        url: { type: 'string' },
        credit: { type: 'string' },
        caption: { type: 'string' },
      },
    },
    sections: {
      type: 'array',
      minItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'content', 'items', 'image'],
        properties: {
          type: {
            type: 'string',
            enum: ['paragraph', 'heading', 'subheading', 'image', 'quote', 'list'],
          },
          content: { type: 'string' },
          items: {
            type: 'array',
            items: { type: 'string' },
          },
          image: {
            type: 'object',
            additionalProperties: false,
            required: ['url', 'credit', 'caption'],
            properties: {
              url: { type: 'string' },
              credit: { type: 'string' },
              caption: { type: 'string' },
            },
          },
        },
      },
    },
  },
} as const;
