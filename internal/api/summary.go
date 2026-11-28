package api

import (
	"net/http"
	"sort"
)

type SummaryCounts struct {
	InStockProducts int `json:"in_stock_products"`
	InStockItems    int `json:"in_stock_items"`
	AllProducts     int `json:"all_products"`
	DueSoon         int `json:"due_soon"`
	Overdue         int `json:"overdue"`
	ShoppingList    int `json:"shopping_list"`
	LowStock        int `json:"low_stock"`
}

type SummaryProduct struct {
	ID                          int64   `json:"id"`
	Name                        string  `json:"name"`
	InStockCount                int     `json:"in_stock_count"`
	NextDueOnDate               *string `json:"next_due_on_date"`
	NextLocationName            string  `json:"next_location_name,omitempty"`
	LowStockAmount              *int    `json:"low_stock_amount"`
	ManuallyAddedToShoppingList bool    `json:"manually_added_to_shopping_list"`
}

func toSummaryProduct(p Product) SummaryProduct {
	return SummaryProduct{
		ID:                          p.ID,
		Name:                        p.Name,
		InStockCount:                p.InStockCount,
		NextDueOnDate:               p.NextDueOnDate,
		NextLocationName:            p.NextLocationName,
		LowStockAmount:              p.LowStockAmount,
		ManuallyAddedToShoppingList: p.ManuallyAddedToShoppingList,
	}
}

func sortSummaryByDueDate(list []SummaryProduct) {
	sort.SliceStable(list, func(i, j int) bool {
		a, b := list[i].NextDueOnDate, list[j].NextDueOnDate
		if a == nil && b == nil {
			return list[i].Name < list[j].Name
		}
		if a == nil {
			return false
		}
		if b == nil {
			return true
		}
		if *a != *b {
			return *a < *b
		}
		return list[i].Name < list[j].Name
	})
}

func (s *Server) handleSummary(w http.ResponseWriter, r *http.Request) {
	allProducts, err := s.loadProducts(r.Context(), "")
	if err != nil {
		writeInternalError(w, "summary load products", err)
		return
	}

	var counts SummaryCounts
	counts.AllProducts = len(allProducts)

	dueSoonProducts := []SummaryProduct{}
	overdueProducts := []SummaryProduct{}
	shoppingListProducts := []SummaryProduct{}

	for _, p := range allProducts {
		if p.InStockCount > 0 {
			counts.InStockProducts++
			counts.InStockItems += p.InStockCount
		}
		if p.Overdue {
			counts.Overdue++
			overdueProducts = append(overdueProducts, toSummaryProduct(p))
		}
		if p.DueSoon {
			counts.DueSoon++
			dueSoonProducts = append(dueSoonProducts, toSummaryProduct(p))
		}
		if p.LowStock {
			counts.LowStock++
		}
		if p.OnShoppingList {
			counts.ShoppingList++
			shoppingListProducts = append(shoppingListProducts, toSummaryProduct(p))
		}
	}

	sortSummaryByDueDate(overdueProducts)
	sortSummaryByDueDate(dueSoonProducts)

	writeJSON(w, http.StatusOK, map[string]any{
		"counts":                 counts,
		"due_soon_products":      dueSoonProducts,
		"overdue_products":       overdueProducts,
		"shopping_list_products": shoppingListProducts,
	})
}
