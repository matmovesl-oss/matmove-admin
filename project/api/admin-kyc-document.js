import { createClient } from '@supabase/supabase-js';

const BUCKET = 'kyc-documents';

const TYPES = {
  id_card_url: ['id_front', 'identity_front'],
  id_card_back_url: ['id_back', 'identity_back'],
  selfie_url: ['selfie'],
  license_doc_url: ['license_doc', 'drivers_license_front'],
  business_doc_url: ['business_doc', 'business_document'],
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fail = (status, message) =>
  Object.assign(new Error(message), { status });

// Accept only a document reference retrieved from the database.
export function normalizeReference(reference, userId, projectUrl) {
  if (typeof reference !== 'string' || !reference.trim()) {
    return null;
  }

  let path = reference.trim();

  if (/^https?:\/\//i.test(path)) {
    const url = new URL(path);

    if (url.origin !== new URL(projectUrl).origin) {
      throw fail(422, 'Document URL belongs to another project.');
    }

    const match = url.pathname.match(
      /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/kyc-documents\/(.+)$/
    );

    if (!match) {
      throw fail(422, 'Unrecognized document URL.');
    }

    path = decodeURIComponent(match[1]);
  }

  path = path
    .replace(/^\/?kyc-documents\//, '')
    .replace(/^\//, '');

  if (
    path.includes('\\') ||
    path
      .split('/')
      .some((part) => !part || part === '.' || part === '..')
  ) {
    throw fail(422, 'Invalid document path.');
  }

  if (path.includes('/') && !path.startsWith(`${userId}/`)) {
    throw fail(
      422,
      'Document path does not belong to this customer.'
    );
  }

  return path;
}

export async function resolveDocumentPath(
  client,
  userId,
  documentType,
  reference,
  projectUrl
) {
  const path = normalizeReference(
    reference,
    userId,
    projectUrl
  );

  if (!path) {
    throw fail(404, 'This document has not been submitted.');
  }

  if (path.includes('/')) {
    return path;
  }

  // Older profiles may contain the original filename.
  // Check only this customer's folder.
  const files = [];

  for (let offset = 0; offset < 10000; offset += 100) {
    const { data, error } = await client.storage
      .from(BUCKET)
      .list(userId, {
        limit: 100,
        offset,
        sortBy: {
          column: 'name',
          order: 'asc',
        },
      });

    if (error) {
      throw fail(502, 'Unable to inspect document storage.');
    }

    files.push(
      ...(data || []).filter((file) => file.id)
    );

    if (!data || data.length < 100) {
      break;
    }

    if (offset === 9900) {
      throw fail(
        409,
        'Too many files to safely resolve this legacy document.'
      );
    }
  }

  const exact = files.filter(
    (file) => file.name === path
  );

  if (exact.length === 1) {
    return `${userId}/${exact[0].name}`;
  }

  const matches = files.filter((file) =>
    TYPES[documentType].some(
      (type) =>
        file.name.startsWith(`${type}-`) &&
        /^\d+\.[a-z0-9]+$/i.test(
          file.name.slice(type.length + 1)
        )
    )
  );

  if (matches.length === 1) {
    return `${userId}/${matches[0].name}`;
  }

  if (matches.length > 1) {
    throw fail(
      409,
      'Multiple older uploads match this document. Ask the customer to resubmit or reconcile the exact path.'
    );
  }

  throw fail(
    404,
    'Document file was not found. Ask the customer to resubmit.'
  );
}

export function createHandler(
  clientFactory = createClient,
  env = process.env
) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');

      return res.status(405).json({
        error: 'Method Not Allowed',
      });
    }

    try {
      const token = /^Bearer\s+(\S+)$/i.exec(
        req.headers.authorization || ''
      )?.[1];

      if (!token) {
        throw fail(
          401,
          'Please sign in to the admin portal.'
        );
      }

      const projectUrl =
        env.SUPABASE_URL || env.VITE_SUPABASE_URL;

      const secret = env.SUPABASE_SERVICE_ROLE_KEY;

      if (!projectUrl || !secret) {
        throw fail(
          503,
          'Admin document service is not configured.'
        );
      }

      const client = clientFactory(
        projectUrl,
        secret,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        }
      );

      const {
        data: authData,
        error: authError,
      } = await client.auth.getUser(token);

      if (authError || !authData?.user) {
        throw fail(
          401,
          'Your session has expired. Please sign in again.'
        );
      }

      const {
        data: admin,
        error: adminError,
      } = await client
        .from('admins')
        .select('id')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (adminError) {
        throw fail(
          502,
          'Unable to verify admin access.'
        );
      }

      if (!admin) {
        throw fail(
          403,
          'KYC viewing requires membership in the admins table.'
        );
      }

      let body = req.body;

      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          throw fail(400, 'Invalid request body.');
        }
      }

      const { userId, documentType } = body || {};

      if (
        typeof userId !== 'string' ||
        !UUID.test(userId) ||
        !Object.hasOwn(TYPES, documentType)
      ) {
        throw fail(
          400,
          'A valid customer ID and document type are required.'
        );
      }

      const {
        data: profile,
        error: profileError,
      } = await client
        .from('profiles')
        .select(`id,${documentType}`)
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        throw fail(
          502,
          'Unable to load the customer document record.'
        );
      }

      if (!profile) {
        throw fail(404, 'Customer not found.');
      }

      let reference = profile[documentType];

      // Use the document table if the profile has no reference.
      if (!reference) {
        const {
          data: submission,
          error,
        } = await client
          .from('kyc_submissions')
          .select('id')
          .eq('profile_id', userId)
          .order('submitted_at', {
            ascending: false,
            nullsFirst: false,
          })
          .order('created_at', {
            ascending: false,
          })
          .limit(1)
          .maybeSingle();

        if (error) {
          throw fail(
            502,
            'Unable to load KYC submission.'
          );
        }

        if (submission) {
          const {
            data: documents,
            error: documentsError,
          } = await client
            .from('kyc_documents')
            .select('storage_path')
            .eq('submission_id', submission.id)
            .in(
              'document_type',
              TYPES[documentType]
            );

          if (documentsError) {
            throw fail(
              502,
              'Unable to load KYC documents.'
            );
          }

          if (documents?.length > 1) {
            throw fail(
              409,
              'This submission has multiple matching documents. Reconcile the exact path.'
            );
          }

          reference =
            documents?.[0]?.storage_path;
        }
      }

      const path = await resolveDocumentPath(
        client,
        userId,
        documentType,
        reference,
        projectUrl
      );

      const { data, error } = await client.storage
        .from(BUCKET)
        .createSignedUrl(path, 300);

      if (error || !data?.signedUrl) {
        throw fail(
          404,
          'Document could not be opened. Check that the saved path exists in Storage.'
        );
      }

      return res.status(200).json({
        signedUrl: data.signedUrl,
        expiresIn: 300,
        format: /\.pdf$/i.test(path)
          ? 'pdf'
          : 'image',
        resolvedLegacyReference:
          !normalizeReference(
            reference,
            userId,
            projectUrl
          )?.includes('/'),
      });
    } catch (error) {
      return res
        .status(error.status || 500)
        .json({
          error: error.status
            ? error.message
            : 'Unable to open this KYC document.',
        });
    }
  };
}

export default createHandler();