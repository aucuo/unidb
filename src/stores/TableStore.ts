import { makeAutoObservable, runInAction } from "mobx";
import {toastStore} from "@/stores/ToastStore.ts";
import authStore from "@/stores/AuthStore.ts";

interface DataItem {
    [key: string]: any;
    additional?: {
        [key: string]: Option,
    }
}

interface Option {
    id: number;
    name: string;
}

interface Row {
    id: number;
    selected: boolean;
}

class TableStore {
    data: DataItem[] = [];
    additionalData: { [key: string]: Option[] } = {};
    selectedRows: Row[] = [];
    currentPage: number = 1;
    pagesCount: number = 1;
    searchQuery: string = '';
    availableFilters: string[] = [];
    isLoading: boolean = true;
    url?: string = undefined;
    urlParams?: string = '';

    constructor(tableName: string) {
        makeAutoObservable(this);
        this.url = `https://localhost:7030/aucusoft/${tableName}`;
    }

    // URL
    updateUrlParams(key: string, value: string) {
        let params = new URLSearchParams(this.urlParams);
        params.set(key, value);  // Обновляет или добавляет параметр
        this.urlParams = params.toString();
    }
    removeUrlParam(key: string) {
        let params = new URLSearchParams(this.urlParams);
        params.delete(key);  // Удаляет параметр
        this.urlParams = params.toString();
    }

    // Table search
    async setSearchQuery(query: string) {
        console.log(query)
        this.isLoading = true;
        this.searchQuery = query;
        if (query !== "") this.updateUrlParams("searchQuery", this.searchQuery);
        else this.removeUrlParam("searchQuery")
        await this.loadData()
    }

    // Table pagination
    async setCurrentPage(page: number) {
        this.currentPage = Math.min(Math.max(page, 1), this.pagesCount);
        await this.loadData();
    }
    async nextPage() {
        if (this.currentPage < this.pagesCount) {
            await this.setCurrentPage(this.currentPage + 1);
        }
    }
    async previousPage() {
        if (this.currentPage > 1) {
            await this.setCurrentPage(this.currentPage - 1);
        }
    }

    // Table rows
    toggleRow(index: number) {
        this.selectedRows[index].selected = !this.selectedRows[index].selected;
    }
    toggleAllRows() {
        const allSelected = this.selectedRows.every(row => row.selected);
        this.selectedRows.forEach(row => row.selected = !allSelected);
    }
    get allSelected() {
        return this.selectedRows.every(row => row.selected);
    }

    // API
    async loadData() {
        let params = new URLSearchParams(this.urlParams);
        params.set('pageIndex', this.currentPage.toString());
        params.set('pageSize', '5');
        params.set('sortDirection', 'asc');

        const url = `${this.url}?${params.toString()}`;
        this.isLoading = true;

        const token = localStorage.getItem('token');
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };

        try {
            const response = await fetch(url, { headers: headers });

            const jsonData = await response.json();
            runInAction(() => {
                this.data = jsonData.data.filter((item:any) =>
                    Object.values(item).some(v => v !== null && !(Array.isArray(v) && v.length === 0))
                );
                this.additionalData = jsonData.additional;
                this.pagesCount = jsonData.totalPages;
                this.selectedRows = this.data.map(item => ({ id: item.id, selected: false }));
                if (!this.availableFilters.length) {
                    this.availableFilters = Object.keys(this.data[0] || {});
                }
                this.isLoading = false;
            });
        } catch (error) {
            runInAction(() => {
                authStore.logout();
                toastStore.setShow(`Failed to fetch data. Try to re-login`, "warning");
                this.isLoading = false;
            });
        }
    }
    async deleteData(itemId:number) {
        const token = localStorage.getItem('token');
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };

        const url = `https://localhost:7030/aucusoft/Projects/${itemId}`;

        try {
            const response = await fetch(url, {
                method: 'DELETE',
                headers: headers
            });

            if (response.ok) {
                runInAction(() => {
                    // Обновляем данные в UI, например, удаляем строку из списка
                    toastStore.setShow('Project deleted successfully', "default");
                    this.loadData();
                });
            } else {
                // Обработка ошибок, если запрос не удался
                toastStore.setShow('Failed to delete the project.', "error");
            }
        } catch (error) {
            runInAction(() => {
                authStore.logout();
                toastStore.setShow(`Failed to fetch data. Try to re-login`, "warning");
                this.isLoading = false;
            });
        }
    }

    // Update API
    async updateItem(index: number, key: string, value: any, id: number) {
        const item = this.data[index];
        if (item) {
            item[key] = value;
            await this.submitData(id);
        }
    }
    async submitData(id: number) {
        const item = this.data.find(item => item.id === id);
        if (!item) {
            toastStore.setShow("Item with the specified ID not found.", "warning");
            return;
        }

        const baseUrl = this.url || "https://localhost:7030/aucusoft/Projects";
        const params = new URLSearchParams();

        Object.keys(item).forEach(key => {
            if (key.endsWith('FK')) {
                const newKey = key.replace('FK', 'ID');
                params.append(newKey, item[key]);
            } else if (key.endsWith('Date')) {
                params.append(key, item[key]);
            } else {
                params.append(key, item[key]);
            }
        });

        const url = `${baseUrl}/${id}?${params.toString()}`;

        const token = localStorage.getItem('token');
        try {
            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params
            });
            if (!response.ok) {
                toastStore.setShow(`HTTP error! status: ${response.status}`, "error");
            }
            toastStore.setShow("Data successfully updated", "default");
            await this.loadData();
        } catch (error) {
            toastStore.setShow(`Failed to submit data: ${error}`, "warning");
            console.error("Failed to submit data:", error);
        }
    }
}

export default TableStore;
