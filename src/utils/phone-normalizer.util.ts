/**
 * Normalise un numéro de téléphone en supprimant les espaces, 
 * les caractères spéciaux et les indicateurs de pays
 * 
 * Exemples:
 * +221784504052 -> 784504052
 * 78 450 40 52 -> 784504052
 * +221 78 450 40 52 -> 784504052
 * 7 8 4 5 0 40 5 2 -> 784504052
 * 
 * @param phone Le numéro de téléphone à normaliser
 * @returns Le numéro normalisé (uniquement les chiffres)
 */
export function normalizePhoneNumber(phone: string | null | undefined): string {
  if (!phone) {
    return '';
  }

  // Supprimer tous les espaces
  let normalized = phone.replace(/\s+/g, '');

  // Supprimer les indicateurs de pays communs (+221, +225, etc.)
  // Regex pour supprimer les indicateurs de pays qui commencent par +
  normalized = normalized.replace(/^\+221/, ''); // Sénégal
  normalized = normalized.replace(/^\+225/, ''); // Côte d'Ivoire
  normalized = normalized.replace(/^\+33/, '');  // France
  // Supprimer tout indicateur de pays commençant par + suivi de 2-3 chiffres
  normalized = normalized.replace(/^\+\d{2,3}/, '');

  // Supprimer tous les caractères non numériques restants (+, -, ., etc.)
  normalized = normalized.replace(/\D/g, '');

  return normalized;
}
