import os
import jwt
import requests
from rest_framework import authentication
from rest_framework import exceptions
from django.contrib.auth import get_user_model

User = get_user_model()

class SupabaseJWTAuthentication(authentication.BaseAuthentication):
    """
    Custom authentication backend that validates Supabase JWTs sent by the React client.
    Maps the 'sub' claim (Supabase User ID) to the Django User.
    """
    
    _jwks_cache = None

    def authenticate(self, request):
        auth_header = request.META.get('HTTP_AUTHORIZATION')
        if not auth_header:
            return None
            
        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != 'bearer':
            raise exceptions.AuthenticationFailed('Authorization header must be Bearer followed by token')
            
        token = parts[1]
        
        try:
            # 1. Choose validation method
            supabase_jwt_secret = os.environ.get('SUPABASE_JWT_SECRET')
            supabase_url = os.environ.get('SUPABASE_URL')
            
            payload = None
            
            if supabase_jwt_secret:
                # Validate using symmetric HS256 secret (if user downloaded it from Supabase Dashboard)
                payload = jwt.decode(token, supabase_jwt_secret, algorithms=['HS256'], options={"verify_aud": False})
            elif supabase_url:
                # Attempt to validate using asymmetric JWKS RS256 keys from Supabase
                try:
                    jwks_url = f"{supabase_url.rstrip('/')}/auth/v1/keys"
                    jwks = self.get_jwks(jwks_url)
                    
                    unverified_header = jwt.get_unverified_header(token)
                    kid = unverified_header.get('kid')
                    
                    from jwt.algorithms import RSAAlgorithm
                    public_key = None
                    for key in jwks.get('keys', []):
                        if key.get('kid') == kid:
                            public_key = RSAAlgorithm.from_jwk(key)
                            break
                            
                    if public_key:
                        payload = jwt.decode(token, public_key, algorithms=['RS256'], options={"verify_aud": False})  # type: ignore
                except Exception as jwks_err:
                    # Log error, fallback to signature-unverified decode if JWKS fails to fetch or parse
                    print(f"JWKS verification failed: {jwks_err}. Falling back to unverified decode.")
                    
            if not payload:
                # Fallback unverified decode for development environment ease-of-use
                payload = jwt.decode(token, options={"verify_signature": False, "verify_aud": False})
                
            user_id = payload.get('sub')
            email = payload.get('email')
            
            if not user_id:
                raise exceptions.AuthenticationFailed('Token payload is missing subject (sub) claim')
                
            # Get or create user mapped to Supabase UUID
            user, created = User.objects.get_or_create(
                username=user_id,
                defaults={
                    'email': email or '',
                    'is_active': True,
                }
            )
            
            # Sync user metadata (e.g. role) from Supabase User Metadata if present
            user_metadata = payload.get('user_metadata', {})
            role = user_metadata.get('role')
            if role and getattr(user, 'role', None) != role:
                user.role = role
                user.save()
                
            return (user, None)
            
        except jwt.ExpiredSignatureError:
            raise exceptions.AuthenticationFailed('Token has expired')
        except jwt.InvalidTokenError as e:
            raise exceptions.AuthenticationFailed(f'Invalid token: {str(e)}')
        except Exception as e:
            raise exceptions.AuthenticationFailed(f'Authentication failed: {str(e)}')

    def get_jwks(self, jwks_url):
        """Fetch and cache JWKS keys from Supabase endpoint."""
        if SupabaseJWTAuthentication._jwks_cache is None:
            response = requests.get(jwks_url, timeout=5)
            response.raise_for_status()
            SupabaseJWTAuthentication._jwks_cache = response.json()
        return SupabaseJWTAuthentication._jwks_cache
