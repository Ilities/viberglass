import { useEffect, useState } from 'react'
import {
  getModelRecipe,
  listModelHostAccounts,
  listModelHostFlavours,
  listModelRecipes,
} from '@/service/api/model-hosting-api'
import type { ModelHostAccount, ModelHostFlavour, ModelRecipe, ModelRecipeSummary } from '@viberglass/types'

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Accounts, recipes and the account's GPUs the deploy form picks from. */
export function useDeployOptions(open: boolean, accountId: string) {
  const [accounts, setAccounts] = useState<ModelHostAccount[] | null>(null)
  const [recipes, setRecipes] = useState<ModelRecipeSummary[]>([])
  const [flavours, setFlavours] = useState<ModelHostFlavour[] | null>(null)
  const [flavourError, setFlavourError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    listModelHostAccounts()
      .then(setAccounts)
      .catch(() => setAccounts([]))
    listModelRecipes()
      .then(setRecipes)
      .catch(() => setRecipes([]))
  }, [open])

  useEffect(() => {
    setFlavours(null)
    setFlavourError(null)
    if (!open || !accountId) return
    let current = true
    listModelHostFlavours(accountId)
      .then((list) => current && setFlavours(list.filter((flavour) => flavour.available)))
      .catch((error) => current && setFlavourError(message(error)))
    return () => {
      current = false
    }
  }, [open, accountId])

  return { accounts, setAccounts, recipes, flavours, flavourError }
}

/** The recipe of the model picked, once it names one. */
export function useModelRecipe(recipeModel: string | null) {
  const [recipe, setRecipe] = useState<ModelRecipe | null>(null)

  useEffect(() => {
    setRecipe(null)
    if (!recipeModel) return
    let current = true
    getModelRecipe(recipeModel)
      .then((loaded) => current && setRecipe(loaded))
      .catch(() => current && setRecipe(null))
    return () => {
      current = false
    }
  }, [recipeModel])

  return recipe
}
