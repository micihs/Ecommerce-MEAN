import { MatSnackBar } from '@angular/material/snack-bar';
import { map, distinctUntilChanged, filter, switchMap, take, skip, withLatestFrom } from 'rxjs/operators';
import { Component, ChangeDetectionStrategy, OnDestroy } from '@angular/core';
import { Observable, combineLatest, Subscription } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { Store } from '@ngrx/store';
import { TranslateService } from '../../../services/translate.service';
import { sortOptions } from '../../../shared/constants';
import * as actions from '../../../store/actions';
import * as fromRoot from '../../../store/reducers';
import { Product, Category, Pagination, Cart } from '../../../shared/models';

@Component({
  selector: 'app-products',
  templateUrl: './products.component.html',
  styleUrls: ['./products.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductsComponent implements OnDestroy {
  products$: Observable<Product[]>;
  cartIds$: Observable<{ [productID: string]: number }>;
  loadingProducts$: Observable<boolean>;
  categories$: Observable<Category[]>;
  subCategories$: Observable<Category[]>;
  pagination$: Observable<Pagination>;
  category$: Observable<string>;
  categoryInfo$: Observable<Category>;
  filterPrice$: Observable<number>;
  maxPrice$: Observable<number>;
  minPrice$: Observable<number>;
  page$: Observable<number>;
  sortBy$: Observable<string>;
  currency$: Observable<string>;
  lang$: Observable<string>;
  categoriesSub: Subscription;
  productsSub: Subscription;
  sortOptions = sortOptions;
  sidebarOpened = false;

  readonly component = 'productsComponent';

  constructor(
    private store: Store<fromRoot.State>,
    private route: ActivatedRoute,
    private router: Router,
    private snackBar: MatSnackBar,
    private meta: Meta,
    private title: Title,
    private translate: TranslateService
  ) {
        this.category$ = this.route.params.pipe(
        map((params) => params['category']),
        distinctUntilChanged()
        );
        this.page$ = this.route.queryParams.pipe(
        map((params) => params['page']),
        map((page) => parseFloat(page))
        );
        this.sortBy$ = this.route.queryParams.pipe(
        map((params) => params['sort']),
        map((sort) => sort)
        );
        this.lang$ = this.translate.getLang$().pipe(filter((lang: string) => !!lang));

        this.maxPrice$ = this.store.select(fromRoot.getMaxPrice);
        this.minPrice$ = this.store.select(fromRoot.getMinPrice);
        this.filterPrice$ = this.store.select(fromRoot.getPriceFilter);
        this.loadingProducts$ = this.store.select(fromRoot.getLoadingProducts);
        this.products$ = this.store.select(fromRoot.getProducts).pipe(filter((products) => !!products));
        this.cartIds$ = this.store.select(fromRoot.getCart).pipe(
        filter((cart) => !!cart),
        map((cart: Cart) =>
            cart.items && cart.items.length ? cart.items.reduce((prev, curr) => ({ ...prev, [curr.id]: curr.qty }), {}) : {}
        )
        );

        this.title.setTitle('Eshop Mean');
        this.meta.updateTag({ name: 'description', content: 'Angular - Node.js - Eshop application - MEAN Eshop with dashboard' });

        this.categories$ = this.store.select(fromRoot.getCategories);
        this.pagination$ = this.store.select(fromRoot.getPagination);
        this.currency$ = this.store.select(fromRoot.getCurrency);
        this.categoryInfo$ = this.category$.pipe(
        switchMap((category) =>
            this.categories$.pipe(
            map((categories) => {
                const foundCategory = categories.find((cat) => cat.titleUrl === category);
                return foundCategory;
            })
            )
        )
        );
        this.subCategories$ = combineLatest([this.categories$, this.categoryInfo$.pipe(filter((cat) => !!cat))]).pipe(
        map(([categories, category]) => {
            return categories.filter((cat) => category.subCategories.includes(cat.titleUrl));
        })
        );

        this.subCategories$.subscribe();

        this._loadCategories();
        this._loadProducts();
    }

    addToCart(id: string): void {
        this.store.dispatch(new actions.AddToCart('?id=' + id));

        this.translate.getTranslations$()
        .pipe(map(translations => translations
            ? {message: translations['ADDED_TO_CART'] || 'Added to cart', action: translations['TO_CART'] || 'To Cart'}
            : {message: 'Added to cart', action: 'To Cart'}
            ),take(1))
        .subscribe(({message, action}) => {
            let snackBarRef = this.snackBar.open(message, action, {duration: 3000});
            snackBarRef.onAction().pipe(
                withLatestFrom(this.lang$),
                take(1))
            .subscribe(([_, lang]) => {
                this.router.navigate(['/' + lang + '/cart'])
            });
        });
    }

    removeFromCart(id: string): void {
        this.store.dispatch(new actions.RemoveFromCart('?id=' + id));
    }

    priceRange(price: number): void {
        this.filterPrice$.pipe(take(1)).subscribe((filterPrice) => {
        if (filterPrice !== price) {
            this.store.dispatch(new actions.FilterPrice(price));
        }
        });
    }

    changeCategory(): void {
        this.store.dispatch(new actions.UpdatePosition({ productsComponent: 0 }));
    }

    changePage(page: number): void {
        combineLatest([this.category$, this.sortBy$, this.lang$])
        .pipe(take(1))
        .subscribe(([category, sortBy, lang]: [string, string, string]) => {
            if (category) {
            this.router.navigate(['/' + lang + '/product/category/' + category], {
                queryParams: { sort: sortBy || 'newest', page: page || 1 },
            });
            } else {
            this.router.navigate(['/' + lang + '/product/all'], {
                queryParams: { sort: sortBy || 'newest', page: page || 1 },
            });
            }
        });
        this.store.dispatch(new actions.UpdatePosition({ productsComponent: 0 }));
    }

    changeSort(sort: string): void {
        combineLatest([this.category$, this.page$, this.lang$])
        .pipe(take(1))
        .subscribe(([category, page, lang]: [string, number, string]) => {
            if (category) {
            this.router.navigate(['/' + lang + '/product/category/' + category], {
                queryParams: { sort, page: page || 1 },
            });
            } else {
            this.router.navigate(['/' + lang + '/product/all'], { queryParams: { sort, page: page || 1 } });
            }
        });
        this.store.dispatch(new actions.UpdatePosition({ productsComponent: 0 }));
    }

    toggleSidebar() {
        this.sidebarOpened = !this.sidebarOpened;
    }

    ngOnDestroy(): void {
        this.categoriesSub.unsubscribe();
        this.productsSub.unsubscribe();
    }

    private _loadCategories(): void {
        combineLatest([this.categories$.pipe(take(1)), this.lang$.pipe(take(1))])
        .pipe(take(1))
        .subscribe(([categories, lang]) => {
            if (!categories.length) {
            this.store.dispatch(new actions.GetCategories(lang));
            }
        });

        this.categoriesSub = this.lang$.pipe(distinctUntilChanged(), skip(1)).subscribe((lang: string) => {
        this.store.dispatch(new actions.GetCategories(lang));
        });
    }

    private _loadProducts(): void {
        this.productsSub = combineLatest([
        this.lang$.pipe(distinctUntilChanged()),
        this.category$.pipe(distinctUntilChanged()),
        this.filterPrice$.pipe(distinctUntilChanged()),
        this.route.queryParams.pipe(
            map((params) => ({ page: params['page'], sort: params['sort'] })),
            distinctUntilChanged()
        ),
        ]).subscribe(([lang, category, filterPrice, { page, sort }]) => {
        this.store.dispatch(
            new actions.GetProducts({ lang, category, maxPrice: filterPrice, page: page || 1, sort: sort || 'newest' })
        );
        });
    }
}