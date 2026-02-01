#!/bin/bash

# ===================================================================
# Azure RAG Service Deployment Script
# ===================================================================
# This script automates the deployment of the RAG service to Azure
# Usage: ./deploy.sh <environment> [options]
# Example: ./deploy.sh dev
#          ./deploy.sh prod --validate-only
# ===================================================================

set -e  # Exit on error
set -u  # Exit on undefined variable

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ===================================================================
# FUNCTIONS
# ===================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Azure CLI
    if ! command -v az &> /dev/null; then
        log_error "Azure CLI is not installed. Please install it from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
        exit 1
    fi
    
    # Check Azure CLI version
    AZ_VERSION=$(az version --query '"azure-cli"' -o tsv)
    log_info "Azure CLI version: $AZ_VERSION"
    
    # Check if logged in
    if ! az account show &> /dev/null; then
        log_error "Not logged in to Azure. Please run 'az login' first."
        exit 1
    fi
    
    # Show current subscription
    SUBSCRIPTION_NAME=$(az account show --query name -o tsv)
    SUBSCRIPTION_ID=$(az account show --query id -o tsv)
    log_info "Current subscription: $SUBSCRIPTION_NAME ($SUBSCRIPTION_ID)"
    
    # Check jq
    if ! command -v jq &> /dev/null; then
        log_warning "jq is not installed. Install it for better output parsing: sudo apt-get install jq"
    fi
    
    log_success "Prerequisites check completed"
}

validate_template() {
    log_info "Validating Bicep template..."
    
    az deployment group validate \
        --resource-group "$RESOURCE_GROUP" \
        --template-file "$TEMPLATE_FILE" \
        --parameters "$PARAMETERS_FILE" \
        --parameters environment="$ENVIRONMENT" \
        --output table
    
    log_success "Template validation passed"
}

what_if_analysis() {
    log_info "Running what-if analysis..."
    
    az deployment group what-if \
        --resource-group "$RESOURCE_GROUP" \
        --template-file "$TEMPLATE_FILE" \
        --parameters "$PARAMETERS_FILE" \
        --parameters environment="$ENVIRONMENT"
    
    log_info "What-if analysis completed"
}

deploy_infrastructure() {
    log_info "Deploying infrastructure to Azure..."
    
    DEPLOYMENT_NAME="rag-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S)"
    
    log_info "Deployment name: $DEPLOYMENT_NAME"
    log_info "Resource Group: $RESOURCE_GROUP"
    log_info "Environment: $ENVIRONMENT"
    
    # Deploy
    az deployment group create \
        --resource-group "$RESOURCE_GROUP" \
        --template-file "$TEMPLATE_FILE" \
        --parameters "$PARAMETERS_FILE" \
        --parameters environment="$ENVIRONMENT" \
        --name "$DEPLOYMENT_NAME" \
        --verbose
    
    log_success "Deployment completed successfully"
    
    # Save deployment name for later use
    echo "$DEPLOYMENT_NAME" > .last-deployment-name
    
    return 0
}

show_outputs() {
    log_info "Retrieving deployment outputs..."
    
    if [ -f .last-deployment-name ]; then
        DEPLOYMENT_NAME=$(cat .last-deployment-name)
    else
        log_error "No deployment name found. Run deployment first."
        return 1
    fi
    
    # Get outputs
    az deployment group show \
        --resource-group "$RESOURCE_GROUP" \
        --name "$DEPLOYMENT_NAME" \
        --query properties.outputs \
        --output json > "deployment-outputs-${ENVIRONMENT}.json"
    
    log_success "Deployment outputs saved to deployment-outputs-${ENVIRONMENT}.json"
    
    # Display summary
    echo ""
    log_info "=== Deployment Summary ==="
    
    if command -v jq &> /dev/null; then
        APP_URL=$(jq -r '.containerAppUrl.value' "deployment-outputs-${ENVIRONMENT}.json" 2>/dev/null || echo "N/A")
        KEYVAULT_NAME=$(jq -r '.keyVaultName.value' "deployment-outputs-${ENVIRONMENT}.json" 2>/dev/null || echo "N/A")
        SEARCH_ENDPOINT=$(jq -r '.searchServiceEndpoint.value' "deployment-outputs-${ENVIRONMENT}.json" 2>/dev/null || echo "N/A")
        
        echo -e "${GREEN}Application URL:${NC} $APP_URL"
        echo -e "${GREEN}Key Vault:${NC} $KEYVAULT_NAME"
        echo -e "${GREEN}Search Endpoint:${NC} $SEARCH_ENDPOINT"
    else
        cat "deployment-outputs-${ENVIRONMENT}.json"
    fi
    
    echo ""
}

verify_deployment() {
    log_info "Verifying deployment..."
    
    if [ -f "deployment-outputs-${ENVIRONMENT}.json" ] && command -v jq &> /dev/null; then
        APP_URL=$(jq -r '.containerAppUrl.value' "deployment-outputs-${ENVIRONMENT}.json")
        
        if [ "$APP_URL" != "null" ] && [ "$APP_URL" != "N/A" ]; then
            log_info "Testing health endpoint: ${APP_URL}/health"
            
            # Wait a bit for the app to start
            sleep 10
            
            if curl -sf "${APP_URL}/health" > /dev/null; then
                log_success "Health check passed!"
            else
                log_warning "Health check failed. The app may still be starting up."
                log_info "Check logs with: az containerapp logs show --name <app-name> --resource-group $RESOURCE_GROUP --follow"
            fi
        fi
    else
        log_warning "Cannot verify deployment. jq not installed or outputs not found."
    fi
}

cleanup_deployment() {
    log_warning "This will DELETE all resources in resource group: $RESOURCE_GROUP"
    read -p "Are you sure? Type 'yes' to confirm: " CONFIRM
    
    if [ "$CONFIRM" = "yes" ]; then
        log_info "Deleting resource group..."
        az group delete \
            --name "$RESOURCE_GROUP" \
            --yes \
            --no-wait
        log_success "Resource group deletion initiated (running in background)"
    else
        log_info "Cleanup cancelled"
    fi
}

show_usage() {
    cat << EOF
Usage: $0 <environment> [options]

Environments:
    dev         Deploy to development environment
    staging     Deploy to staging environment
    prod        Deploy to production environment

Options:
    --validate-only         Only validate the template, don't deploy
    --what-if              Run what-if analysis to preview changes
    --skip-validation      Skip template validation before deployment
    --show-outputs         Show outputs from last deployment
    --verify               Verify deployment by testing endpoints
    --cleanup              Delete all resources in the resource group
    -h, --help             Show this help message

Examples:
    $0 dev                              # Deploy to dev
    $0 prod --validate-only             # Validate prod template
    $0 staging --what-if                # Preview staging changes
    $0 prod --show-outputs              # Show prod deployment outputs

Environment Variables:
    RESOURCE_GROUP         Override default resource group name
    AZURE_SUBSCRIPTION_ID  Use specific subscription

EOF
}

# ===================================================================
# MAIN
# ===================================================================

# Parse arguments
if [ $# -eq 0 ]; then
    show_usage
    exit 1
fi

ENVIRONMENT=$1
shift

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
    log_error "Invalid environment: $ENVIRONMENT"
    show_usage
    exit 1
fi

# Set defaults
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_FILE="$SCRIPT_DIR/main.bicep"
PARAMETERS_FILE="$SCRIPT_DIR/parameters.${ENVIRONMENT}.json"
RESOURCE_GROUP="${RESOURCE_GROUP:-rg-rag-service-${ENVIRONMENT}}"

VALIDATE_ONLY=false
WHAT_IF_ONLY=false
SKIP_VALIDATION=false
SHOW_OUTPUTS_ONLY=false
VERIFY_ONLY=false
CLEANUP_ONLY=false

# Parse options
while [[ $# -gt 0 ]]; do
    case $1 in
        --validate-only)
            VALIDATE_ONLY=true
            shift
            ;;
        --what-if)
            WHAT_IF_ONLY=true
            shift
            ;;
        --skip-validation)
            SKIP_VALIDATION=true
            shift
            ;;
        --show-outputs)
            SHOW_OUTPUTS_ONLY=true
            shift
            ;;
        --verify)
            VERIFY_ONLY=true
            shift
            ;;
        --cleanup)
            CLEANUP_ONLY=true
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Check if parameter file exists, fall back to default
if [ ! -f "$PARAMETERS_FILE" ]; then
    log_warning "Parameter file not found: $PARAMETERS_FILE"
    log_info "Falling back to default parameters.json"
    PARAMETERS_FILE="$SCRIPT_DIR/parameters.json"
fi

# Print configuration
log_info "=== Configuration ==="
log_info "Environment: $ENVIRONMENT"
log_info "Resource Group: $RESOURCE_GROUP"
log_info "Template: $TEMPLATE_FILE"
log_info "Parameters: $PARAMETERS_FILE"
echo ""

# Run based on options
if [ "$CLEANUP_ONLY" = true ]; then
    cleanup_deployment
    exit 0
fi

if [ "$SHOW_OUTPUTS_ONLY" = true ]; then
    show_outputs
    exit 0
fi

if [ "$VERIFY_ONLY" = true ]; then
    verify_deployment
    exit 0
fi

# Main deployment flow
check_prerequisites

# Ensure resource group exists
if ! az group exists --name "$RESOURCE_GROUP" | grep -q "true"; then
    log_info "Resource group does not exist. Creating..."
    LOCATION="${AZURE_LOCATION:-eastus}"
    az group create \
        --name "$RESOURCE_GROUP" \
        --location "$LOCATION" \
        --tags Environment="$ENVIRONMENT" Application=rag-service
    log_success "Resource group created"
fi

if [ "$SKIP_VALIDATION" = false ]; then
    validate_template
fi

if [ "$WHAT_IF_ONLY" = true ]; then
    what_if_analysis
    exit 0
fi

if [ "$VALIDATE_ONLY" = true ]; then
    log_success "Validation complete. Exiting (--validate-only specified)"
    exit 0
fi

# Deploy
deploy_infrastructure

# Show outputs
show_outputs

# Verify
verify_deployment

log_success "All done! 🚀"
echo ""
log_info "Next steps:"
echo "  1. Verify the deployment in Azure Portal"
echo "  2. Update your container image and redeploy: ./deploy.sh $ENVIRONMENT"
echo "  3. Configure your DNS to point to the Container App URL"
echo "  4. Set up monitoring alerts in Application Insights"
echo ""
