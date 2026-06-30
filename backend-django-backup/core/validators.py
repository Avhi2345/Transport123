from django.core.exceptions import ValidationError
import phonenumbers

def validate_phone_number(value):
    """
    Validates a phone number using the phonenumbers library.
    Checks for exact 10 digits for India.
    Checks validity for other countries.
    """
    if not value:
        return

    try:
        # 1. Parse number (Default to IN if no + prefix)
        parsed_number = phonenumbers.parse(value, "IN")
        
        # 2. Check if valid number
        if not phonenumbers.is_valid_number(parsed_number):
            raise ValidationError("Invalid phone number. Please enter a valid mobile number.")
            
        # 3. Country Specific Checks
        region_code = phonenumbers.region_code_for_number(parsed_number)
        
        if region_code == 'IN':
            # Strict 10-digit check for India
            national_number = str(parsed_number.national_number)
            if len(national_number) != 10:
                raise ValidationError("Indian mobile numbers must be exactly 10 digits.")
                
            # Basic mobile prefix check (start with 6-9)
            if not national_number[0] in ['6', '7', '8', '9']:
                 raise ValidationError("Invalid Indian mobile number format.")

    except phonenumbers.NumberParseException:
         raise ValidationError("Invalid phone number format.")
    except Exception as e:
         raise ValidationError(f"Invalid phone number: {str(e)}")
