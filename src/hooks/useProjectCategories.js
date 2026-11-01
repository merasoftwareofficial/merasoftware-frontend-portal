import SummaryApi from '../common';
import { useResource } from './useResource';

const useProjectCategories = (scope = 'admin') => {
  const endpoint = scope === 'admin' ? SummaryApi.categoryBasePrices : SummaryApi.customerProjectCategories;
  const { data, loading, error, refresh } = useResource(endpoint.url);
  return { categories: Array.isArray(data) ? data : [], loading, error, reload: refresh };
};
export default useProjectCategories;
