declare module 'jwks-rsa' {
  interface SigningKey {
    publicKey?: string;
    rsaPublicKey?: string;
    getPublicKey?: () => string;
  }
  interface ClientOptions {
    jwksUri: string;
    cache?: boolean;
    rateLimit?: boolean;
    jwksRequestsPerMinute?: number;
  }
  function jwksClient(opts: ClientOptions): {
    getSigningKey: (kid: string, cb: (err: any, key?: SigningKey) => void) => void;
  };
  export = jwksClient;
}

