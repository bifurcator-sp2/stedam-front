export function useRegProviders() {
  const config = useRuntimeConfig()
  const toast = useToast()

  return   [{
    label: 'VK',
    //icon: 'i-simple-icons-google',
    onClick: () => {
      toast.add({ title: 'VK', description: 'Login with VK' })
    }
  }, {
    label: 'MAX',
    //icon: 'i-simple-icons-github',
    onClick: () => {
      toast.add({ title: 'MAX', description: 'Login with MAX' })
    }
  }]
}
